/**
 * SLM Mesh -- Peer UDS Listener
 * Each MCP server opens a UDS listener so the broker can push notifications.
 * Architecture: Peer-as-Server, Broker-as-Client.
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
}

/**
 * Create a UDS listener for this peer. The broker connects to push
 * notifications (messages, events, lock updates, shutdown).
 */
export function createPeerListener(
  peerId: string,
  config: MeshConfig,
  onNotification: PushHandler,
): PeerListener {
  const socketPath = peerSocketPath(config.peersDir, peerId);
  let server: Server | null = null;
  // PERF-016: Set for O(1) add/delete instead of Array indexOf+splice
  const connections = new Set<Socket>();

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
    ensureDir(config.peersDir);
    cleanStaleSocket();

    return new Promise<void>((resolve, reject) => {
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
        // Set restrictive permissions on socket file
        try {
          chmodSync(socketPath, 0o600);
          /* v8 ignore next 3 */
        } catch {
          // Best effort — some platforms may not support this
        }
        log(`Peer listener started: ${socketPath}`);
        resolve();
      });
    });
  }

  async function stop(): Promise<void> {
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

  return { socketPath, start, stop };
}
