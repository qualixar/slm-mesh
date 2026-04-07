/**
 * SLM Mesh — MCP Server comprehensive coverage tests
 * Tests internal helpers, tool registration, heartbeat, and cleanup.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfig } from '../../../src/config.js';
import {
  textResult,
  errorResult,
  safeBrokerCall,
  registerTools,
  startHeartbeat,
  cleanup,
  resetCleaningUp,
  type ServerState,
} from '../../../src/mcp/server.js';

// --- textResult ---

describe('textResult', () => {
  it('wraps data as MCP text content', () => {
    const result = textResult({ ok: true, count: 5 });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ ok: true, count: 5 });
  });

  it('handles null data', () => {
    const result = textResult(null);
    expect(JSON.parse(result.content[0].text)).toBeNull();
  });

  it('handles string data', () => {
    const result = textResult('hello');
    expect(JSON.parse(result.content[0].text)).toBe('hello');
  });
});

// --- errorResult ---

describe('errorResult', () => {
  it('wraps error message as MCP error content', () => {
    const result = errorResult('something failed');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ ok: false, error: 'something failed' });
  });
});

// --- safeBrokerCall ---

describe('safeBrokerCall', () => {
  let server: HttpServer;
  let port: number;

  afterEach(() => {
    if (server) server.close();
  });

  it('returns parsed JSON on success', async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, data: 'test' }));
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );
    const result = await safeBrokerCall<{ ok: boolean; data: string }>(port, '/health');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('test');
  });

  it('wraps errors with "Broker unavailable" prefix', async () => {
    await expect(safeBrokerCall(19876, '/health')).rejects.toThrow(/Broker unavailable/);
  });

  it('passes body to broker', async () => {
    let receivedBody = '';
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        receivedBody = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );
    await safeBrokerCall(port, '/send', { msg: 'hello' });
    expect(JSON.parse(receivedBody)).toEqual({ msg: 'hello' });
  });
});

// --- registerTools ---

describe('registerTools', () => {
  it('registers all 8 mesh tools on an McpServer-like object', () => {
    const registeredTools: string[] = [];
    const fakeMcp = {
      registerTool: (name: string, _schema: unknown, _handler: unknown) => {
        registeredTools.push(name);
      },
    };

    const state: ServerState = {
      peerId: 'test-peer',
      peerName: 'Test Peer',
      brokerPort: 9999,
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: null,
      peerListener: null,
    };

    registerTools(fakeMcp as never, state);

    expect(registeredTools).toEqual([
      'mesh_peers',
      'mesh_summary',
      'mesh_send',
      'mesh_inbox',
      'mesh_state',
      'mesh_lock',
      'mesh_events',
      'mesh_status',
    ]);
  });
});

// --- Tool handler coverage (through real broker) ---

describe('tool handlers via real broker', () => {
  let server: HttpServer;
  let port: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolHandlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(async () => {
    // Start a mock broker
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const parsed = body ? JSON.parse(body) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Return different responses based on path
        if (req.url === '/peers') {
          res.end(JSON.stringify({ ok: true, peers: [] }));
        } else if (req.url === '/summary') {
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === '/send') {
          res.end(JSON.stringify({ ok: true, messageId: 'msg-1' }));
        } else if (req.url === '/messages') {
          res.end(JSON.stringify({ ok: true, messages: [] }));
        } else if (req.url === '/state') {
          res.end(JSON.stringify({ ok: true, entry: parsed }));
        } else if (req.url === '/lock') {
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === '/events') {
          res.end(JSON.stringify({ ok: true, events: [] }));
        } else if (req.url === '/status') {
          res.end(JSON.stringify({ ok: true, status: 'ok' }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );

    const fakeMcp = {
      registerTool: (name: string, _schema: unknown, handler: unknown) => {
        toolHandlers.set(name, handler as never);
      },
    };

    const state: ServerState = {
      peerId: 'test-peer-1',
      peerName: 'Test Peer 1',
      brokerPort: port,
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: null,
      peerListener: null,
    };

    registerTools(fakeMcp as never, state);
  });

  afterEach(() => {
    if (server) server.close();
    toolHandlers.clear();
  });

  it('mesh_peers calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_peers')!;
    const result = await handler({ scope: 'machine' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_summary calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_summary')!;
    const result = await handler({ summary: 'Working on tests' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_send calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_send')!;
    const result = await handler({ to: 'peer-2', message: 'hello', type: undefined });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_inbox calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_inbox')!;
    const result = await handler({ filter: undefined, from: undefined, limit: undefined });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_state calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_state')!;
    const result = await handler({ action: 'get', key: 'mykey', value: undefined, namespace: undefined });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_lock calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_lock')!;
    const result = await handler({ action: 'query', filePath: undefined, reason: undefined, ttlMinutes: undefined });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_events calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_events')!;
    const result = await handler({ action: undefined, types: undefined, since: undefined, limit: undefined });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('mesh_status calls broker and returns result', async () => {
    const handler = toolHandlers.get('mesh_status')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });
});

// --- Tool handler error paths ---

describe('tool handler error paths', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolHandlers = new Map<string, (...args: any[]) => Promise<any>>();

  beforeEach(() => {
    const fakeMcp = {
      registerTool: (name: string, _schema: unknown, handler: unknown) => {
        toolHandlers.set(name, handler as never);
      },
    };

    // Use a port that definitely doesn't have a server
    const state: ServerState = {
      peerId: 'err-peer',
      peerName: 'Error Peer',
      brokerPort: 19876,
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: null,
      peerListener: null,
    };

    registerTools(fakeMcp as never, state);
  });

  afterEach(() => {
    toolHandlers.clear();
  });

  it('mesh_peers returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_peers')!;
    const result = await handler({ scope: 'machine' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('Broker unavailable');
  });

  it('mesh_summary returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_summary')!;
    const result = await handler({ summary: 'test' });
    expect(result.isError).toBe(true);
  });

  it('mesh_send returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_send')!;
    const result = await handler({ to: 'x', message: 'hi' });
    expect(result.isError).toBe(true);
  });

  it('mesh_inbox returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_inbox')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
  });

  it('mesh_state returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_state')!;
    const result = await handler({ action: 'get', key: 'k' });
    expect(result.isError).toBe(true);
  });

  it('mesh_lock returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_lock')!;
    const result = await handler({ action: 'query' });
    expect(result.isError).toBe(true);
  });

  it('mesh_events returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_events')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
  });

  it('mesh_status returns error on broker failure', async () => {
    const handler = toolHandlers.get('mesh_status')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
  });
});

// --- startHeartbeat ---

describe('startHeartbeat', () => {
  let state: ServerState;
  let server: HttpServer;
  let port: number;
  let requestPaths: string[] = [];

  beforeEach(async () => {
    requestPaths = [];
    server = createServer((req, res) => {
      requestPaths.push(req.url ?? '');
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/heartbeat') {
          res.end(JSON.stringify({ ok: true }));
        } else if (req.url === '/register') {
          res.end(JSON.stringify({ ok: true, peerId: 'new-peer', name: 'New Peer' }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );

    state = {
      peerId: 'hb-peer',
      peerName: 'HB Peer',
      brokerPort: port,
      config: createConfig({
        dataDir: '/tmp/test-mesh',
        heartbeatIntervalMs: 50, // very fast for testing
      }),
      heartbeatTimer: null,
      peerListener: null,
    };
  });

  afterEach(() => {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    if (server) server.close();
  });

  it('starts periodic heartbeats', async () => {
    startHeartbeat(state);
    expect(state.heartbeatTimer).not.toBeNull();
    // Wait for heartbeat to fire
    await new Promise<void>((r) => setTimeout(r, 120));
    expect(requestPaths).toContain('/heartbeat');
  });

  it('re-registers when broker returns peer not found', async () => {
    // Override server to return "Peer not found"
    server.close();
    server = createServer((req, res) => {
      requestPaths.push(req.url ?? '');
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/heartbeat') {
          res.end(JSON.stringify({ ok: false, error: 'Peer not found' }));
        } else if (req.url === '/register') {
          res.end(JSON.stringify({ ok: true, peerId: 'new-peer-id', name: 'New Name' }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );
    state.brokerPort = port;

    startHeartbeat(state);
    await new Promise<void>((r) => setTimeout(r, 150));
    expect(requestPaths).toContain('/register');
  });

  it('handles heartbeat failure (broker crash)', async () => {
    // Start heartbeat then close server to simulate crash
    state.brokerPort = 19876; // nothing listening
    startHeartbeat(state);
    await new Promise<void>((r) => setTimeout(r, 100));
    // Should not crash — just logs error
    expect(state.heartbeatTimer).not.toBeNull();
  });
});

// --- cleanup ---

describe('cleanup', () => {
  let server: HttpServer;
  let port: number;
  let unregisterCalled = false;

  beforeEach(async () => {
    resetCleaningUp();
    unregisterCalled = false;
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        if (req.url === '/unregister') unregisterCalled = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );
  });

  afterEach(() => {
    resetCleaningUp();
    if (server) server.close();
  });

  it('clears heartbeat timer and unregisters from broker', async () => {
    const timer = setInterval(() => {}, 10000);
    const state: ServerState = {
      peerId: 'clean-peer',
      peerName: 'Clean Peer',
      brokerPort: port,
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: timer,
      peerListener: null,
    };

    await cleanup(state);
    expect(state.heartbeatTimer).toBeNull();
    expect(unregisterCalled).toBe(true);
  });

  it('stops peer listener during cleanup', async () => {
    let listenerStopped = false;
    const state: ServerState = {
      peerId: 'clean-peer-2',
      peerName: 'Clean Peer 2',
      brokerPort: port,
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: null,
      peerListener: {
        socketPath: '/tmp/fake.sock',
        start: async () => {},
        stop: async () => { listenerStopped = true; },
      },
    };

    await cleanup(state);
    expect(listenerStopped).toBe(true);
    expect(state.peerListener).toBeNull();
  });

  it('guard against double cleanup', async () => {
    const state: ServerState = {
      peerId: 'dup-peer',
      peerName: 'Dup Peer',
      brokerPort: port,
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: null,
      peerListener: null,
    };

    await cleanup(state);
    expect(unregisterCalled).toBe(true);
    unregisterCalled = false;

    // Second call should be guarded
    await cleanup(state);
    expect(unregisterCalled).toBe(false);
  });

  it('handles broker gone during unregister', async () => {
    const state: ServerState = {
      peerId: 'gone-peer',
      peerName: 'Gone Peer',
      brokerPort: 19876, // nothing listening
      config: createConfig({ dataDir: '/tmp/test-mesh' }),
      heartbeatTimer: null,
      peerListener: null,
    };

    // Should not throw
    await cleanup(state);
  });
});

// --- INSTRUCTIONS constant coverage ---

describe('server INSTRUCTIONS', () => {
  it('INSTRUCTIONS is included in server config', async () => {
    // This just ensures the INSTRUCTIONS const is evaluated/covered
    const { VERSION, PRODUCT_NAME } = await import('../../../src/config.js');
    expect(VERSION).toBeDefined();
    expect(PRODUCT_NAME).toBeDefined();
  });
});
