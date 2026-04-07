/**
 * SLM Mesh — PeerConnection tests
 * TDD RED phase: tests written before implementation
 * Uses real UDS servers via node:net for integration-level unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PeerConnection } from '../../../src/broker/push/connection.js';
import { createNdjsonParser } from '../../../src/broker/push/ndjson.js';
import type { PushNotification } from '../../../src/types.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'slm-mesh-test-'));
}

function makeNotification(type: PushNotification['type'] = 'message'): PushNotification {
  return {
    type,
    payload: { text: 'hello' },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a UDS server that collects received NDJSON messages.
 * Returns the server, socket path, and a promise-based way to get received messages.
 */
function createTestServer(socketPath: string): {
  server: Server;
  received: unknown[];
  connections: Socket[];
} {
  const received: unknown[] = [];
  const connections: Socket[] = [];

  const server = createServer((socket) => {
    connections.push(socket);
    const parse = createNdjsonParser((msg) => received.push(msg));
    socket.on('data', (chunk) => parse(chunk));
  });

  return { server, received, connections };
}

function listenUds(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.on('error', reject);
  });
}

describe('PeerConnection', () => {
  let tempDir: string;
  let socketPath: string;
  let server: Server;
  let received: unknown[];
  let connections: Socket[];

  beforeEach(async () => {
    tempDir = makeTempDir();
    socketPath = join(tempDir, 'test-peer.sock');

    const testServer = createTestServer(socketPath);
    server = testServer.server;
    received = testServer.received;
    connections = testServer.connections;

    await listenUds(server, socketPath);
  });

  afterEach(async () => {
    // Clean up connections
    for (const conn of connections) {
      conn.destroy();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('connects to a UDS server', async () => {
    const pc = new PeerConnection('peer-1', socketPath);
    const result = await pc.connect();

    expect(result).toBe(true);
    expect(pc.isConnected).toBe(true);
    expect(pc.peerId).toBe('peer-1');

    pc.disconnect();
  });

  it('returns false when connecting to non-existent socket (ENOENT)', async () => {
    const badPath = join(tempDir, 'nonexistent.sock');
    const pc = new PeerConnection('peer-bad', badPath);
    const result = await pc.connect();

    expect(result).toBe(false);
    expect(pc.isConnected).toBe(false);

    pc.disconnect();
  });

  it('returns false when server is not listening (ECONNREFUSED)', async () => {
    // Close the server first so connection is refused
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Create a socket file that exists but nothing listens on it
    const staleSocket = join(tempDir, 'stale.sock');
    const pc = new PeerConnection('peer-refused', staleSocket);
    const result = await pc.connect();

    expect(result).toBe(false);
    expect(pc.isConnected).toBe(false);

    pc.disconnect();
  });

  it('sends NDJSON messages to the server', async () => {
    const pc = new PeerConnection('peer-sender', socketPath);
    await pc.connect();

    const notification = makeNotification('message');
    const sent = pc.send(notification);
    expect(sent).toBe(true);

    // Give the server a moment to receive the data
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(notification);

    pc.disconnect();
  });

  it('sends multiple messages', async () => {
    const pc = new PeerConnection('peer-multi', socketPath);
    await pc.connect();

    pc.send(makeNotification('message'));
    pc.send(makeNotification('event'));
    pc.send(makeNotification('peer_update'));

    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(3);

    pc.disconnect();
  });

  it('reports isConnected correctly after disconnect', async () => {
    const pc = new PeerConnection('peer-disc', socketPath);
    await pc.connect();
    expect(pc.isConnected).toBe(true);

    pc.disconnect();
    expect(pc.isConnected).toBe(false);
  });

  it('send returns false when not connected', () => {
    const pc = new PeerConnection('peer-noconn', socketPath);
    // Never called connect()
    const result = pc.send(makeNotification());
    expect(result).toBe(false);
  });

  it('disconnect is idempotent', async () => {
    const pc = new PeerConnection('peer-idem', socketPath);
    await pc.connect();

    pc.disconnect();
    pc.disconnect(); // Should not throw
    expect(pc.isConnected).toBe(false);
  });

  it('send returns false after disconnect', async () => {
    const pc = new PeerConnection('peer-afterdisc', socketPath);
    await pc.connect();
    pc.disconnect();

    const result = pc.send(makeNotification());
    expect(result).toBe(false);
  });

  it('exposes peerId', () => {
    const pc = new PeerConnection('my-peer-id', socketPath);
    expect(pc.peerId).toBe('my-peer-id');
    pc.disconnect();
  });
});
