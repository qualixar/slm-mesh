import type { MeshConfig } from '../config.js';
import { BRANDING } from '../config.js';
import { openDatabase, closeDatabase, checkpointWal } from '../db/connection.js';
import { log, logError } from '../util/logger.js';
import { ensureDir } from '../util/paths.js';
import { BrokerHttpServer } from './server.js';
import { createHandlers } from './handlers.js';
import { PushManager } from './push/manager.js';
import { createWsServer, type WsServer } from './push/ws-server.js';
import { createDiscovery, type DiscoveryService } from './discovery.js';
import { IdleShutdownTimer } from './idle.js';
import { markStalePeers, cleanDeadPeers, sweepStaleSockets } from './cleanup.js';
import { writePidFile, removePidFile, readPidFile, isProcessAlive, isPidFileStale } from './pid.js';
import { writePortFile, removePortFile, findAvailablePort } from './port.js';
import { generateToken, writeTokenFile, removeTokenFile } from './token.js';
import type Database from 'better-sqlite3';

export class Broker {
  private readonly _config: MeshConfig;
  private _db: Database.Database | null = null;
  private _httpServer: BrokerHttpServer | null = null;
  private _wsServer: WsServer | null = null;
  private _discovery: DiscoveryService | null = null;
  private _push: PushManager | null = null;
  private _idleTimer: IdleShutdownTimer | null = null;
  private _checkpointTimer: ReturnType<typeof setInterval> | null = null;
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private _shuttingDown = false;
  private _startedAt = 0;
  private _actualPort = 0;
  private _signalHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  constructor(config: MeshConfig) {
    this._config = config;
  }

  async start(): Promise<void> {
    const config = this._config;

    ensureDir(config.dataDir);
    ensureDir(config.peersDir);

    if (isPidFileStale(config.pidPath)) {
      log('Removing stale PID file');
      const stalePid = readPidFile(config.pidPath);
      if (stalePid !== null) {
        removePidFile(config.pidPath, stalePid);
      }
      removePortFile(config.portPath);
    } else {
      const existingPid = readPidFile(config.pidPath);
      if (existingPid !== null && isProcessAlive(existingPid)) {
        throw new Error(`Broker already running (PID ${existingPid})`);
      }
    }

    this._db = openDatabase(config);
    this._cleanStaleFromCrash();
    sweepStaleSockets(config.peersDir);

    const token = generateToken();
    writeTokenFile(config.tokenPath, token);
    const validTokens = new Set([token]);
    if (config.sharedSecret) validTokens.add(config.sharedSecret);

    this._httpServer = new BrokerHttpServer();
    this._httpServer.setBearerTokens(validTokens);
    this._push = new PushManager();
    this._startedAt = Date.now();

    const subscriptions = new Map<string, string[]>();
    const handlers = createHandlers({
      db: this._db,
      push: this._push,
      startedAt: this._startedAt,
      subscriptions,
      config,
    });

    this._httpServer.addRoute('GET', '/health', handlers.handleHealth);
    this._httpServer.addRoute('GET', '/status', () => {
      const result = handlers.handleStatus();
      return { ...result, port: this._actualPort };
    });
    this._httpServer.addRoute('POST', '/register', (body) => {
      this._idleTimer?.reset();
      return handlers.handleRegister(body);
    });
    this._httpServer.addRoute('POST', '/unregister', handlers.handleUnregister);
    /* v8 ignore start */
    this._httpServer.addRoute('POST', '/heartbeat', (body) => {
      this._idleTimer?.reset();
      return handlers.handleHeartbeat(body);
    });
    /* v8 ignore stop */
    this._httpServer.addRoute('POST', '/peers', handlers.handlePeers);
    this._httpServer.addRoute('POST', '/summary', handlers.handleSummary);
    this._httpServer.addRoute('POST', '/send', handlers.handleSend);
    this._httpServer.addRoute('POST', '/messages', handlers.handleMessages);
    this._httpServer.addRoute('POST', '/state', handlers.handleState);
    this._httpServer.addRoute('POST', '/lock', handlers.handleLock);
    this._httpServer.addRoute('POST', '/events', handlers.handleEvents);

    this._actualPort = await findAvailablePort(
      config.brokerPort,
      config.brokerHost,
      config.maxPortRetries,
    );
    await this._httpServer.start(this._actualPort, config.brokerHost);

    // Start WebSocket server for remote push
    this._wsServer = createWsServer(
      config.wsPort,
      config.brokerHost,
      validTokens,
      (data) => {
        if (typeof data === 'object' && data !== null) {
          log(`WS message received: ${JSON.stringify(data).slice(0, 200)}`);
        }
      },
      (clientId) => {
        log(`WS client connected: ${clientId}`);
      },
      (clientId) => {
        log(`WS client disconnected: ${clientId}`);
      },
    );
    await this._wsServer.start();

    // Start mDNS discovery for LAN auto-discovery
    if (config.discoveryEnabled) {
      this._discovery = createDiscovery(
        config.brokerHost,
        this._actualPort,
        config.wsPort,
      );
      await this._discovery.start();
      log('mDNS discovery active — other machines on LAN can find this broker');
    }

    try {
      writePidFile(config.pidPath, process.pid);
      /* v8 ignore next 5 */
    } catch (err) {
      logError('PID file race — another broker started first', err);
      await this.stop();
      throw new Error('Another broker started simultaneously');
    }
    writePortFile(config.portPath, this._actualPort);

    /* v8 ignore start */
    this._idleTimer = new IdleShutdownTimer(config.idleShutdownMs, () => {
      const count = (this._db?.prepare("SELECT COUNT(*) as c FROM peers WHERE status = 'active'").get() as { c: number })?.c ?? 0;
      if (count === 0) {
        log('No active peers — idle shutdown');
        void this.stop();
      } else {
        this._idleTimer?.reset();
      }
    });
    /* v8 ignore stop */

    /* v8 ignore start */
    this._checkpointTimer = setInterval(() => {
      if (this._db) {
        checkpointWal(this._db, 'RESTART');
      }
    }, config.walCheckpointIntervalMs);
    this._checkpointTimer.unref();

    this._cleanupTimer = setInterval(() => {
      if (this._db) {
        markStalePeers(this._db, config.staleThresholdMs);
        const deadIds = cleanDeadPeers(this._db, config.deadThresholdMs);
        for (const id of deadIds) {
          this._push?.disconnect(id);
        }
        handlers.pruneExpiredData();
      }
    }, config.heartbeatIntervalMs);
    this._cleanupTimer.unref();
    /* v8 ignore stop */

    /* v8 ignore start */
    const shutdown = () => void this.stop();
    const onUncaught = (err: unknown) => {
      logError('Uncaught exception', err);
      void this.stop();
    };
    const onUnhandled = (err: unknown) => {
      logError('Unhandled rejection', err);
      void this.stop();
    };
    /* v8 ignore stop */
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUnhandled);
    this._signalHandlers = [
      { event: 'SIGINT', handler: shutdown },
      { event: 'SIGTERM', handler: shutdown },
      { event: 'SIGHUP', handler: shutdown },
      { event: 'uncaughtException', handler: onUncaught },
      { event: 'unhandledRejection', handler: onUnhandled },
    ];

    log(BRANDING);
    log(`Broker started on ${config.brokerHost}:${this._actualPort} (PID ${process.pid})`);
    log(`WebSocket push server on ${config.brokerHost}:${config.wsPort}`);
  }

  async stop(): Promise<void> {
    if (this._shuttingDown) return;
    this._shuttingDown = true;

    log('Broker shutting down...');

    for (const { event, handler } of this._signalHandlers) {
      process.removeListener(event, handler);
    }
    this._signalHandlers = [];

    this._idleTimer?.stop();
    if (this._checkpointTimer) clearInterval(this._checkpointTimer);
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);

    if (this._discovery) {
      await this._discovery.stop();
    }
    if (this._wsServer) {
      await this._wsServer.stop();
    }
    if (this._httpServer) {
      await this._httpServer.stop();
    }

    this._push?.broadcast({
      type: 'shutdown',
      payload: {},
      timestamp: new Date().toISOString(),
    });
    this._push?.disconnectAll();

    if (this._db) {
      closeDatabase(this._db);
      this._db = null;
    }

    removePidFile(this._config.pidPath, process.pid);
    removePortFile(this._config.portPath);
    removeTokenFile(this._config.tokenPath);

    log('Broker stopped');
  }

  get isRunning(): boolean {
    return this._httpServer?.isListening ?? false;
  }

  get port(): number {
    return this._actualPort;
  }

  get discoveredBrokers(): ReturnType<DiscoveryService['getDiscoveredBrokers']> {
    return this._discovery?.getDiscoveredBrokers() ?? [];
  }

  private _cleanStaleFromCrash(): void {
    if (!this._db) return;
    this._db.prepare("UPDATE peers SET status = 'dead' WHERE status IN ('active', 'stale')").run();
    this._db.prepare("DELETE FROM locks WHERE locked_by IN (SELECT id FROM peers WHERE status = 'dead')").run();
    const deleted = this._db.prepare("DELETE FROM peers WHERE status = 'dead'").run();
    if (deleted.changes > 0) {
      log(`Cleaned ${deleted.changes} stale peers from previous crash`);
    }
  }
}
