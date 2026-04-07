/**
 * SLM Mesh — PushManager tests
 * TDD RED phase: tests written before implementation
 * Creates multiple real UDS servers to test the manager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PushManager } from '../../../src/broker/push/manager.js';
import { createNdjsonParser } from '../../../src/broker/push/ndjson.js';
import type { PushNotification } from '../../../src/types.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'slm-mesh-test-'));
}

function makeNotification(type: PushNotification['type'] = 'message'): PushNotification {
  return {
    type,
    payload: { text: 'test' },
    timestamp: new Date().toISOString(),
  };
}

interface TestPeer {
  server: Server;
  socketPath: string;
  received: unknown[];
  connections: Socket[];
}

function createTestPeer(socketPath: string): TestPeer {
  const received: unknown[] = [];
  const connections: Socket[] = [];
  const server = createServer((socket) => {
    connections.push(socket);
    const parse = createNdjsonParser((msg) => received.push(msg));
    socket.on('data', (chunk) => parse(chunk));
  });
  return { server, socketPath, received, connections };
}

function listenUds(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.on('error', reject);
  });
}

async function cleanupPeer(peer: TestPeer): Promise<void> {
  for (const conn of peer.connections) {
    conn.destroy();
  }
  await new Promise<void>((resolve) => {
    peer.server.close(() => resolve());
  });
}

describe('PushManager', () => {
  let tempDir: string;
  const peers: TestPeer[] = [];

  beforeEach(() => {
    tempDir = makeTempDir();
    peers.length = 0;
  });

  afterEach(async () => {
    for (const peer of peers) {
      await cleanupPeer(peer);
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  async function spawnPeer(name: string): Promise<TestPeer> {
    const socketPath = join(tempDir, `${name}.sock`);
    const peer = createTestPeer(socketPath);
    await listenUds(peer.server, socketPath);
    peers.push(peer);
    return peer;
  }

  it('tracks connected peers', async () => {
    const manager = new PushManager();
    const peer1 = await spawnPeer('peer-1');
    const peer2 = await spawnPeer('peer-2');

    manager.connect('peer-1', peer1.socketPath);
    manager.connect('peer-2', peer2.socketPath);

    // Allow connections to establish
    await new Promise((r) => setTimeout(r, 100));

    expect(manager.peerCount).toBe(2);
    expect(manager.getConnectedPeers().sort()).toEqual(['peer-1', 'peer-2']);

    manager.disconnectAll();
  });

  it('sends to a specific peer', async () => {
    const manager = new PushManager();
    const peer1 = await spawnPeer('peer-1');

    manager.connect('peer-1', peer1.socketPath);
    await new Promise((r) => setTimeout(r, 100));

    const notification = makeNotification('event');
    const sent = manager.send('peer-1', notification);
    expect(sent).toBe(true);

    await new Promise((r) => setTimeout(r, 50));
    expect(peer1.received).toHaveLength(1);
    expect(peer1.received[0]).toEqual(notification);

    manager.disconnectAll();
  });

  it('broadcasts to all peers', async () => {
    const manager = new PushManager();
    const peer1 = await spawnPeer('peer-1');
    const peer2 = await spawnPeer('peer-2');
    const peer3 = await spawnPeer('peer-3');

    manager.connect('peer-1', peer1.socketPath);
    manager.connect('peer-2', peer2.socketPath);
    manager.connect('peer-3', peer3.socketPath);
    await new Promise((r) => setTimeout(r, 100));

    const notification = makeNotification('shutdown');
    manager.broadcast(notification);

    await new Promise((r) => setTimeout(r, 50));

    expect(peer1.received).toHaveLength(1);
    expect(peer2.received).toHaveLength(1);
    expect(peer3.received).toHaveLength(1);
    expect(peer1.received[0]).toEqual(notification);

    manager.disconnectAll();
  });

  it('returns false when sending to unknown peer', () => {
    const manager = new PushManager();
    const result = manager.send('nonexistent', makeNotification());
    expect(result).toBe(false);
  });

  it('disconnects a specific peer', async () => {
    const manager = new PushManager();
    const peer1 = await spawnPeer('peer-1');
    const peer2 = await spawnPeer('peer-2');

    manager.connect('peer-1', peer1.socketPath);
    manager.connect('peer-2', peer2.socketPath);
    await new Promise((r) => setTimeout(r, 100));

    expect(manager.peerCount).toBe(2);

    manager.disconnect('peer-1');
    expect(manager.peerCount).toBe(1);
    expect(manager.getConnectedPeers()).toEqual(['peer-2']);

    manager.disconnectAll();
  });

  it('disconnectAll cleans up everything', async () => {
    const manager = new PushManager();
    const peer1 = await spawnPeer('peer-1');
    const peer2 = await spawnPeer('peer-2');

    manager.connect('peer-1', peer1.socketPath);
    manager.connect('peer-2', peer2.socketPath);
    await new Promise((r) => setTimeout(r, 100));

    manager.disconnectAll();

    expect(manager.peerCount).toBe(0);
    expect(manager.getConnectedPeers()).toEqual([]);
  });

  it('peerCount reflects actual connections', async () => {
    const manager = new PushManager();
    expect(manager.peerCount).toBe(0);

    const peer1 = await spawnPeer('peer-1');
    manager.connect('peer-1', peer1.socketPath);
    await new Promise((r) => setTimeout(r, 100));
    expect(manager.peerCount).toBe(1);

    const peer2 = await spawnPeer('peer-2');
    manager.connect('peer-2', peer2.socketPath);
    await new Promise((r) => setTimeout(r, 100));
    expect(manager.peerCount).toBe(2);

    manager.disconnect('peer-1');
    expect(manager.peerCount).toBe(1);

    manager.disconnectAll();
    expect(manager.peerCount).toBe(0);
  });

  it('disconnect unknown peer is a no-op', () => {
    const manager = new PushManager();
    // Should not throw
    manager.disconnect('ghost');
    expect(manager.peerCount).toBe(0);
  });

  it('broadcast with no peers is a no-op', () => {
    const manager = new PushManager();
    // Should not throw
    manager.broadcast(makeNotification());
  });

  it('replaces existing connection when connect called twice for same peer', async () => {
    const manager = new PushManager();
    const peer1a = await spawnPeer('peer-1a');
    const peer1b = await spawnPeer('peer-1b');

    manager.connect('peer-1', peer1a.socketPath);
    await new Promise((r) => setTimeout(r, 100));

    // Connect again with different socket — should disconnect old
    manager.connect('peer-1', peer1b.socketPath);
    await new Promise((r) => setTimeout(r, 100));

    expect(manager.peerCount).toBe(1);

    // Send should go to the new socket
    manager.send('peer-1', makeNotification());
    await new Promise((r) => setTimeout(r, 50));

    expect(peer1b.received).toHaveLength(1);

    manager.disconnectAll();
  });
});
