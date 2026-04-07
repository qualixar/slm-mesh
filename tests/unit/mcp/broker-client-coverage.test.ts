/**
 * SLM Mesh — Broker client coverage tests
 * Covers: non-2xx response throwing (lines 37-38).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { brokerRequest } from '../../../src/mcp/broker-client.js';

describe('brokerRequest coverage', () => {
  let server: Server;

  afterEach(() => {
    if (server) server.close();
  });

  it('throws on non-2xx response with body', async () => {
    server = createServer((_, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal error details');
    });
    const port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );

    await expect(brokerRequest(port, '/health')).rejects.toThrow(/500/);
  });

  it('throws on 404 response', async () => {
    server = createServer((_, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    const port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );

    await expect(brokerRequest(port, '/nonexistent')).rejects.toThrow(/404/);
  });
});
