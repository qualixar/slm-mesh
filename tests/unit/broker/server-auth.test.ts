// Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
/**
 * SLM Mesh — Server bearer token auth middleware tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import { BrokerHttpServer } from '../../../src/broker/server.js';

describe('BrokerHttpServer — bearer token auth', () => {
  let server: BrokerHttpServer;
  let port: number;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  async function startServer(token: string | null): Promise<number> {
    server = new BrokerHttpServer();
    server.setBearerToken(token);
    server.addRoute('GET', '/health', () => ({ ok: true, status: 'healthy' }));
    server.addRoute('GET', '/status', () => ({ ok: true, uptime: 123 }));
    server.addRoute('POST', '/register', (body) => ({ ok: true, peerId: body['pid'] }));
    return server.start(0, '127.0.0.1');
  }

  it('allows /health without any token', async () => {
    port = await startServer('secret-token');
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, status: 'healthy' });
  });

  it('rejects non-exempt routes when no Authorization header is sent', async () => {
    port = await startServer('secret-token');
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Unauthorized');
  });

  it('rejects non-exempt routes when an incorrect token is sent', async () => {
    port = await startServer('secret-token');
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('accepts non-exempt routes with the correct Bearer token', async () => {
    port = await startServer('secret-token');
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('accepts POST with correct token', async () => {
    port = await startServer('post-token');
    const res = await fetch(`http://127.0.0.1:${port}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer post-token',
      },
      body: JSON.stringify({ pid: 42 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('rejects POST without token', async () => {
    port = await startServer('post-token');
    const res = await fetch(`http://127.0.0.1:${port}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: 42 }),
    });
    expect(res.status).toBe(401);
  });

  it('allows all routes when token is null (auth disabled)', async () => {
    port = await startServer(null);
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    expect(res.status).toBe(200);
  });
});
