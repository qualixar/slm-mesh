/**
 * SLM Mesh -- Peer Listener (UDS + WebSocket)
 * UDS for local broker connections, WebSocket for remote brokers.
 * Architecture: Peer-as-Server (UDS) + Peer-as-Client (WebSocket).
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { createServer, type Server, type Socket } from 'node:net';
import { unlinkSync, existsSync, chmodSync } from 'node:fs';
import { createNdjsonParser } from '../broker/push/ndjson.js';
import { peerSocketPath } from '../util/paths.js';
import { ensureDir } from '../util/paths.js';
import { log, logError } from '../util/logger.js';
import type { MeshConfig } from '../config.js';

export type PushHandler = (notification: unknown) => void;

export interface PeerListener {
  readonly socketPath: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  updatePeerId?(newPeerId: string): void;
}

/**
 * WebSocket client for remote broker push.
 * Uses raw node:http upgrade — no external WS library dependency.
 */
class WsPushClient {
  private _ws: import('ws').default | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _running = false;
  private _reconnectDelay = 1000;

  constructor(
    private readonly _peerId: string,
    private readonly _host: string,
    private readonly _wsPort: number,
    private readonly _token: string,
    private readonly _onNotification: PushHandler,
  ) {}

  async start(): Promise<void> {
    this._running = true;
    await this._connect();
  }

  updatePeerId(newPeerId: string): void {
    this._peerId = newPeerId;
    if (this._ws && this._ws.readyState === 1) {
      this._ws.send(JSON.stringify({ type: 'hello', peerId: newPeerId }));
    }
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  private async _connect(): Promise<void> {
    if (!this._running) return;
    try {
      const { default: WebSocket } = await import('ws');
      const url = `ws://${this._host}:${this._wsPort}/ws`;
      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${this._token}` },
      });
      this._ws = ws;
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', peerId: this._peerId }));
      });
      ws.on('message', (data: Buffer) => {
        try {
          const parsed = JSON.parse(data.toString());
          this._onNotification(parsed);
        } catch {
          // Ignore malformed messages
        }
      });
      ws.on('close', () => {
        if (this._running) this._scheduleReconnect();
      });
      ws.on('error', () => {
        // Will trigger 'close'
      });
      log(`WebSocket push client connected to ${url}`);
    } catch {
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    if (!this._running) return;
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30_000);
    this._reconnectTimer = setTimeout(() => {
      void this._connect();
    }, this._reconnectDelay);
  }
}

/**
 * Create a peer listener — UDS for local broker, WebSocket client for remote.
 */
export function createPeerListener(
  peerId: string,
  config: MeshConfig,
  onNotification: PushHandler,
): PeerListener {
  const socketPath = peerSocketPath(config.peersDir, peerId);
  let server: Server | null = null;
  const connections = new Set<Socket>();
  let wsClient: WsPushClient | null = null;

  /* v8 ignore start -- defensive cleanup of leftover socket files */
  function cleanStaleSocket(): void {
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {
        // Ignore — may not exist
      }
    }
  }
  /* v8 ignore stop */

  async function start(): Promise<void> {
    if (config.isRemoteEnabled && config.sharedSecret) {
      // Remote broker: connect via WebSocket client
      wsClient = new WsPushClient(
        peerId,
        config.brokerHost,
        config.wsPort,
        config.sharedSecret,
        onNotification,
      );
      await wsClient.start();
    } else {
      // Local broker: create UDS listener
      ensureDir(config.peersDir);
      cleanStaleSocket();

      await new Promise<void>((resolve, reject) => {
        server = createServer((socket) => {
          connections.add(socket);
          const parse = createNdjsonParser((data) => {
            onNotification(data);
          });
          socket.on('data', (chunk) => parse(chunk));
          /* v8 ignore start -- fires on socket-level I/O error */
          socket.on('error', (err) => {
            logError('Peer listener socket error', err);
          });
          /* v8 ignore stop */
          socket.on('close', () => {
            connections.delete(socket);
          });
        });

        /* v8 ignore start -- fires on server bind failure */
        server.on('error', (err) => {
          logError('Peer listener server error', err);
          reject(err);
        });
        /* v8 ignore stop */

        server.listen(socketPath, () => {
          try {
            chmodSync(socketPath, 0o600);
            /* v8 ignore next 3 */
          } catch {
            // Best effort
          }
          log(`Peer listener started: ${socketPath}`);
          resolve();
        });
      });
    }
  }

  async function stop(): Promise<void> {
    if (wsClient) {
      await wsClient.stop();
      wsClient = null;
    }
    for (const conn of connections) {
      conn.destroy();
    }
    connections.clear();

    return new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => {
        server = null;
        cleanStaleSocket();
        log('Peer listener stopped');
        resolve();
      });
    });
  }

  return {
    socketPath,
    start,
    stop,
    updatePeerId(newPeerId: string) {
      wsClient?.updatePeerId(newPeerId);
    },
  };
}
