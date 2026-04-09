/**
 * SLM Mesh — PeerConnection: single UDS connection from broker to a peer
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 *
 * Architecture: Peer-as-Server, Broker-as-Client
 * The broker creates a PeerConnection to connect TO a peer's UDS socket.
 * Messages flow broker → peer via NDJSON framing.
 */

import { createConnection, type Socket } from 'node:net';
import { serialize } from './ndjson.js';
import { log, logError } from '../../util/logger.js';
import type { PushNotification } from '../../types.js';

/** Connection timeout in milliseconds */
const CONNECT_TIMEOUT_MS = 2_000;

/** Backoff parameters for reconnection */
const BACKOFF_INITIAL_MS = 200;
const BACKOFF_MAX_MS = 5_000;
const BACKOFF_MULTIPLIER = 2;
const JITTER_RANGE_MS = 100;

/** PERF-010: Maximum reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 10;

export class PeerConnection {
  private readonly _peerId: string;
  private readonly _socketPath: string;
  private _socket: Socket | null = null;
  private _connected = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _backoffMs = BACKOFF_INITIAL_MS;
  private _intentionalDisconnect = false;
  private _reconnectAttempts = 0;

  constructor(peerId: string, socketPath: string) {
    this._peerId = peerId;
    this._socketPath = socketPath;
  }

  /**
   * Connect to the peer's UDS socket.
   * Returns true on success, false on failure (ECONNREFUSED, ENOENT, timeout).
   */
  connect(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this._intentionalDisconnect = false;

      /* v8 ignore start -- 2s connect timeout rarely fires in tests */
      const timeout = setTimeout(() => {
        if (this._socket) {
          this._socket.destroy();
          this._socket = null;
        }
        this._connected = false;
        logError(`Peer ${this._peerId}: connect timeout after ${CONNECT_TIMEOUT_MS}ms`);
        resolve(false);
      }, CONNECT_TIMEOUT_MS);
      /* v8 ignore stop */

      try {
        this._socket = createConnection({ path: this._socketPath }, () => {
          // Connection established
          clearTimeout(timeout);
          this._connected = true;
          this._backoffMs = BACKOFF_INITIAL_MS;
          this._reconnectAttempts = 0;
          log(`Peer ${this._peerId}: connected via UDS`);
          resolve(true);
        });
        /* v8 ignore start -- createConnection rarely throws synchronously */
      } catch {
        clearTimeout(timeout);
        this._connected = false;
        resolve(false);
        return;
      }
      /* v8 ignore stop */

      this._socket.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        const code = err.code ?? 'UNKNOWN';
        this._connected = false;

        if (code === 'ECONNREFUSED' || code === 'ENOENT') {
          logError(`Peer ${this._peerId}: ${code}`, err);
        } else {
          logError(`Peer ${this._peerId}: socket error`, err);
        }

        // Schedule reconnect if not intentionally disconnected
        if (!this._intentionalDisconnect) {
          this._scheduleReconnect();
        }

        resolve(false);
      });

      this._socket.on('close', () => {
        this._connected = false;
        if (!this._intentionalDisconnect) {
          this._scheduleReconnect();
        }
      });
    });
  }

  /**
   * Disconnect from the peer's UDS socket. Destroys the socket and clears
   * any pending reconnection timer. Idempotent.
   */
  disconnect(): void {
    this._intentionalDisconnect = true;
    this._clearReconnectTimer();

    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    this._connected = false;
  }

  /**
   * Send a push notification to the peer via NDJSON.
   * Returns true if the write was accepted by the socket buffer,
   * false if not connected or backpressured.
   */
  send(notification: PushNotification): boolean {
    if (!this._connected || !this._socket) {
      return false;
    }

    const data = serialize(notification);
    try {
      return this._socket.write(data);
      /* v8 ignore next 4 */
    } catch {
      logError(`Peer ${this._peerId}: write failed`);
      return false;
    }
  }

  /** Whether the socket is currently connected */
  get isConnected(): boolean {
    return this._connected;
  }

  /** The peer ID this connection belongs to */
  get peerId(): string {
    return this._peerId;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff and jitter.
   * Backoff: 200ms -> 400ms -> 800ms -> 1600ms -> 3200ms, capped at 5000ms.
   * Jitter: +/- 100ms random.
   */
  private _scheduleReconnect(): void {
    if (this._intentionalDisconnect || this._reconnectTimer) {
      return;
    }

    // PERF-010: Stop reconnecting after max attempts
    this._reconnectAttempts++;
    /* v8 ignore next 4 -- requires 10+ rapid reconnect failures */
    if (this._reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      logError(`Peer ${this._peerId}: max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded, giving up`);
      return;
    }

    const jitter = Math.floor(Math.random() * JITTER_RANGE_MS * 2) - JITTER_RANGE_MS;
    const delay = Math.min(this._backoffMs + jitter, BACKOFF_MAX_MS);

    log(`Peer ${this._peerId}: reconnecting in ${delay}ms`);

    /* v8 ignore start -- async timer callback */
    const timer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._intentionalDisconnect) {
        void this.connect();
      }
    }, delay);
    /* v8 ignore stop */
    timer.unref(); // Don't prevent process exit during shutdown
    this._reconnectTimer = timer;

    this._backoffMs = Math.min(
      this._backoffMs * BACKOFF_MULTIPLIER,
      BACKOFF_MAX_MS,
    );
  }

  /** Clear any pending reconnection timer */
  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
