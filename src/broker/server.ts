/**
 * SLM Mesh — Broker HTTP Server
 * Zero-dependency HTTP server using node:http with JSON routing.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { log, logError } from '../util/logger.js';

export type RouteHandler = (body: Record<string, unknown>) => Promise<unknown> | unknown;

interface Route {
  readonly method: string;
  readonly path: string;
  readonly handler: RouteHandler;
}

const MAX_BODY_BYTES = 1_048_576; // 1MB

/**
 * Create and configure the broker HTTP server.
 * Routes are registered via addRoute(), then start() binds to a port.
 */
/** Paths that do NOT require bearer token authentication. */
const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health']);

export class BrokerHttpServer {
  // PERF-012: Map keyed by "METHOD /path" for O(1) route lookup
  private readonly _routeMap = new Map<string, Route>();
  private _server: Server | null = null;
  private _bearerToken: string | null = null;

  /**
   * Set the bearer token that all non-exempt requests must present.
   * Call before start(). Pass null to disable auth (testing only).
   */
  setBearerToken(token: string | null): void {
    this._bearerToken = token;
  }

  addRoute(method: string, path: string, handler: RouteHandler): void {
    const key = `${method.toUpperCase()} ${path}`;
    this._routeMap.set(key, { method: method.toUpperCase(), path, handler });
  }

  async start(port: number, host: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this._server = createServer((req, res) => {
        void this._handleRequest(req, res);
      });

      /* v8 ignore start -- only fires on port bind failure */
      this._server.on('error', (err: NodeJS.ErrnoException) => {
        reject(err);
      });
      /* v8 ignore stop */

      this._server.listen(port, host, () => {
        const addr = this._server?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        log(`HTTP server listening on ${host}:${actualPort}`);
        resolve(actualPort);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this._server) {
        resolve();
        return;
      }
      // PERF-013: Kill active connections so server.close() completes promptly
      this._server.closeAllConnections();
      this._server.close(() => {
        this._server = null;
        resolve();
      });
    });
  }

  get isListening(): boolean {
    return this._server?.listening ?? false;
  }

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase() ?? 'GET';
    const url = req.url ?? '/';

    // Bearer token authentication (skip exempt paths like /health)
    if (this._bearerToken && !AUTH_EXEMPT_PATHS.has(url)) {
      const authHeader = req.headers['authorization'] ?? '';
      const expectedHeader = `Bearer ${this._bearerToken}`;
      if (authHeader !== expectedHeader) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized — invalid or missing bearer token' });
        return;
      }
    }

    // PERF-012: O(1) route lookup via Map
    const routeKey = `${method} ${url}`;
    const route = this._routeMap.get(routeKey);

    if (!route) {
      sendJson(res, 404, { ok: false, error: 'Unknown endpoint' });
      return;
    }

    // For GET requests, no body parsing needed
    if (method === 'GET') {
      try {
        const result = await route.handler({});
        sendJson(res, 200, result);
      } catch (err) {
        logError('Handler error', err);
        sendJson(res, 500, { ok: false, error: 'Internal server error' });
      }
      return;
    }

    // Parse JSON body for POST requests
    let body: Record<string, unknown>;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      const status = message.includes('too large') ? 413 : 400;
      sendJson(res, status, { ok: false, error: message });
      return;
    }

    try {
      const result = await route.handler(body);
      sendJson(res, 200, result);
    } catch (err) {
      logError('Handler error', err);
      sendJson(res, 500, { ok: false, error: 'Internal server error' });
    }
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large (max 1MB)'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(new Error('Invalid JSON in request body'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error('Invalid JSON in request body'));
      }
    });

    /* v8 ignore start -- fires on client disconnect during body read */
    req.on('error', (err) => {
      reject(err);
    });
    /* v8 ignore stop */
  });
}
