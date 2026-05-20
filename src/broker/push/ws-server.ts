/**
 * SLM Mesh — WebSocket Push Server
 * Accepts WS connections from remote MCP servers or remote brokers.
 * Authenticated via bearer token (shared secret).
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { WebSocketServer as WsServerType, WebSocket } from 'ws';
import { log, logError } from '../../util/logger.js';

export interface WsServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  broadcast(data: unknown): void;
  readonly clientCount: number;
}

export function createWsServer(
  port: number,
  host: string,
  validTokens: Set<string>,
  onMessage: (data: unknown, clientId: string) => void,
  onConnect: (clientId: string) => void,
  onDisconnect: (clientId: string) => void,
): WsServer {
  let wss: WsServerType | null = null;
  let httpServer: Server | null = null;
  let clientCounter = 0;
  const clients = new Map<string, WebSocket>();

  async function start(): Promise<void> {
    const { WebSocketServer } = await import('ws');

    return new Promise<void>((resolve, reject) => {
      httpServer = createServer();

      wss = new WebSocketServer({ noServer: true });

      httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
        const authHeader = request.headers['authorization'] ?? '';
        let authorized = validTokens.size === 0;
        for (const token of validTokens) {
          if (authHeader === `Bearer ${token}`) {
            authorized = true;
            break;
          }
        }
        if (!authorized) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit('connection', ws, request);
        });
      });

      wss.on('connection', (ws: WebSocket) => {
        const clientId = `ws-${++clientCounter}`;
        clients.set(clientId, ws);
        onConnect(clientId);

        ws.on('message', (data: Buffer) => {
          try {
            const parsed = JSON.parse(data.toString());
            onMessage(parsed, clientId);
          } catch {
            // Ignore non-JSON frames
          }
        });

        ws.on('close', () => {
          clients.delete(clientId);
          onDisconnect(clientId);
        });

        ws.on('error', (err) => {
          logError(`WS client ${clientId} error`, err);
        });
      });

      httpServer.on('error', (err) => {
        reject(err);
      });

      httpServer.listen(port, host, () => {
        log(`WebSocket server listening on ${host}:${port}`);
        resolve();
      });
    });
  }

  async function stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      for (const ws of clients.values()) {
        ws.close();
      }
      clients.clear();
      if (wss) {
        wss.close(() => {
          wss = null;
          if (httpServer) {
            httpServer.close(() => {
              httpServer = null;
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  function broadcast(data: unknown): void {
    const payload = JSON.stringify(data);
    for (const ws of clients.values()) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(payload);
      }
    }
  }

  return {
    start,
    stop,
    broadcast,
    get clientCount(): number {
      return clients.size;
    },
  };
}
