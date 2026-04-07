/**
 * SLM Mesh -- Broker HTTP client tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { brokerRequest } from '../../../src/mcp/broker-client.js';

describe('brokerRequest', () => {
  let server: Server;
  let port: number;

  /**
   * Helper: spin up a tiny HTTP server that echoes back request details.
   */
  function startServer(
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      server = createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          resolve(addr.port);
        }
      });
    });
  }

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('sends POST with JSON body and returns parsed response', async () => {
    port = await startServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, data: { echo: parsed } }));
      });
    });

    const result = await brokerRequest<{ ok: boolean; data: { echo: unknown } }>(
      port,
      '/test-endpoint',
      { hello: 'world' },
    );

    expect(result.ok).toBe(true);
    expect(result.data.echo).toEqual({ hello: 'world' });
  });

  it('sends GET when no body provided', async () => {
    let receivedMethod = '';
    port = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    await brokerRequest(port, '/health');
    expect(receivedMethod).toBe('GET');
  });

  it('sends POST when body is provided', async () => {
    let receivedMethod = '';
    port = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await brokerRequest(port, '/register', { pid: 123 });
    expect(receivedMethod).toBe('POST');
  });

  it('throws on connection refused (no server)', async () => {
    // Use a port that definitely has nothing listening
    await expect(brokerRequest(19999, '/health')).rejects.toThrow();
  });

  it('throws on non-2xx response', async () => {
    port = await startServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Internal error' }));
    });

    await expect(brokerRequest(port, '/fail')).rejects.toThrow(/500/);
  });

  it('sends correct Content-Type header', async () => {
    let receivedContentType = '';
    port = await startServer((req, res) => {
      receivedContentType = req.headers['content-type'] ?? '';
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await brokerRequest(port, '/test', { data: 1 });
    expect(receivedContentType).toBe('application/json');
  });
});
