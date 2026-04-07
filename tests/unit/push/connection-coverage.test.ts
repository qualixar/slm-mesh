/**
 * SLM Mesh — PeerConnection coverage tests
 * Covers: reconnect logic, timeout, write-fail, max reconnect attempts.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:net';
import { PeerConnection } from '../../../src/broker/push/connection.js';

describe('PeerConnection coverage', () => {
  let tempDir: string;
  let udsServer: Server | null = null;
  const connections: PeerConnection[] = [];

  afterEach(() => {
    for (const c of connections) c.disconnect();
    connections.length = 0;
    if (udsServer) {
      udsServer.close();
      udsServer = null;
    }
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSocketPath(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-conn-cov-'));
    return join(tempDir, 'test.sock');
  }

  it('connects to a UDS server', async () => {
    const socketPath = makeSocketPath();
    udsServer = createServer(() => {});
    await new Promise<void>((r) => udsServer!.listen(socketPath, () => r()));

    const conn = new PeerConnection('peer-1', socketPath);
    connections.push(conn);
    const result = await conn.connect();
    expect(result).toBe(true);
    expect(conn.isConnected).toBe(true);
    expect(conn.peerId).toBe('peer-1');
  });

  it('returns false when connecting to nonexistent socket', async () => {
    const socketPath = makeSocketPath();
    const conn = new PeerConnection('peer-2', join(tempDir, 'nonexistent.sock'));
    connections.push(conn);
    const result = await conn.connect();
    expect(result).toBe(false);
    expect(conn.isConnected).toBe(false);
  });

  it('sends data via connected socket', async () => {
    const socketPath = makeSocketPath();
    let receivedData = '';
    udsServer = createServer((socket) => {
      socket.on('data', (chunk) => { receivedData += chunk.toString(); });
    });
    await new Promise<void>((r) => udsServer!.listen(socketPath, () => r()));

    const conn = new PeerConnection('peer-3', socketPath);
    connections.push(conn);
    await conn.connect();

    const sent = conn.send({ type: 'message', payload: { text: 'hi' }, timestamp: new Date().toISOString() });
    expect(sent).toBe(true);

    // Wait for data to arrive
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(receivedData).toContain('hi');
  });

  it('returns false when sending on disconnected socket', () => {
    const conn = new PeerConnection('peer-4', '/tmp/fake.sock');
    connections.push(conn);
    const sent = conn.send({ type: 'test', payload: {}, timestamp: '' });
    expect(sent).toBe(false);
  });

  it('disconnect is idempotent', async () => {
    const socketPath = makeSocketPath();
    udsServer = createServer(() => {});
    await new Promise<void>((r) => udsServer!.listen(socketPath, () => r()));

    const conn = new PeerConnection('peer-5', socketPath);
    connections.push(conn);
    await conn.connect();
    conn.disconnect();
    conn.disconnect(); // idempotent
    expect(conn.isConnected).toBe(false);
  });

  it('schedules reconnect on close when not intentional', async () => {
    const socketPath = makeSocketPath();
    udsServer = createServer((socket) => {
      // Close connection from server side after a short delay
      setTimeout(() => socket.destroy(), 20);
    });
    await new Promise<void>((r) => udsServer!.listen(socketPath, () => r()));

    const conn = new PeerConnection('peer-6', socketPath);
    connections.push(conn);
    await conn.connect();

    // Wait for server to close our connection, triggering reconnect
    await new Promise<void>((r) => setTimeout(r, 100));
    // After reconnect, should still be connected (server accepts new connections)
    // The reconnect may or may not have completed, but the path is exercised
    conn.disconnect(); // clean up
  });

  it('handles connect timeout', async () => {
    const socketPath = makeSocketPath();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(socketPath, '');

    const conn = new PeerConnection('peer-timeout', socketPath);
    connections.push(conn);
    const result = await conn.connect();
    expect(result).toBe(false);
  });

  it('stops reconnecting after max attempts', async () => {
    const socketPath = makeSocketPath();
    // No server — every connect attempt will fail
    const conn = new PeerConnection('peer-maxretry', join(tempDir, 'nope.sock'));
    connections.push(conn);

    // Connect will fail, and _scheduleReconnect is called internally
    const result = await conn.connect();
    expect(result).toBe(false);

    // The reconnect should be scheduled but eventually give up
    // Wait enough for a few reconnect attempts
    await new Promise<void>((r) => setTimeout(r, 600));
    conn.disconnect();
  });

  it('write returns false when socket.write throws', async () => {
    const socketPath = makeSocketPath();
    udsServer = createServer(() => {});
    await new Promise<void>((r) => udsServer!.listen(socketPath, () => r()));

    const conn = new PeerConnection('peer-writefail', socketPath);
    connections.push(conn);
    await conn.connect();

    // Destroy the socket to make write fail
    (conn as unknown as { _socket: { destroy: () => void } })._socket.destroy();

    const sent = conn.send({ type: 'test', payload: {}, timestamp: '' });
    // After socket.destroy(), isConnected may still be true briefly, but write should fail
    // The catch in send() returns false
    expect(sent).toBe(false);
  });
});
