/**
 * SLM Mesh — Peer Listener tests
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createPeerListener } from '../../../src/mcp/peer-listener.js';
import { createConfig } from '../../../src/config.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { serialize } from '../../../src/broker/push/ndjson.js';

describe('PeerListener', () => {
  let tempDir: string;
  const listeners: Array<{ stop(): Promise<void> }> = [];

  afterEach(async () => {
    for (const l of listeners) {
      try { await l.stop(); } catch { /* already stopped */ }
    }
    listeners.length = 0;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  // Use short path peersDir to avoid macOS 103-byte UDS limit
  function shortPeersDir(): string {
    return mkdtempSync(join('/tmp', 'mp-'));
  }

  it('starts and stops without error', async () => {
    tempDir = shortPeersDir();
    const config = createConfig({ peersDir: tempDir, dataDir: tempDir });
    const listener = createPeerListener('11111111-1111-1111-1111-111111111111', config, () => {});
    listeners.push(listener);
    await listener.start();
    expect(listener.socketPath).toContain('.sock');
    await listener.stop();
  });

  it('receives push notifications via UDS', async () => {
    tempDir = shortPeersDir();
    const config = createConfig({ peersDir: tempDir, dataDir: tempDir });
    const received: unknown[] = [];
    const peerId = '22222222-2222-2222-2222-222222222222';
    const listener = createPeerListener(peerId, config, (n) => received.push(n));
    listeners.push(listener);
    await listener.start();

    const socket = createConnection({ path: listener.socketPath });
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    const notification = { type: 'message', payload: { text: 'hi' }, timestamp: new Date().toISOString() };
    socket.write(serialize(notification));
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBe(1);
    expect((received[0] as { type: string }).type).toBe('message');
    socket.destroy();
  });

  it('stop is idempotent', async () => {
    tempDir = shortPeersDir();
    const config = createConfig({ peersDir: tempDir, dataDir: tempDir });
    const listener = createPeerListener('33333333-3333-3333-3333-333333333333', config, () => {});
    listeners.push(listener);
    await listener.start();
    await listener.stop();
    await listener.stop(); // should not throw
  });

  it('handles multiple connections', async () => {
    tempDir = shortPeersDir();
    const config = createConfig({ peersDir: tempDir, dataDir: tempDir });
    const received: unknown[] = [];
    const listener = createPeerListener('44444444-4444-4444-4444-444444444444', config, (n) => received.push(n));
    listeners.push(listener);
    await listener.start();

    const s1 = createConnection({ path: listener.socketPath });
    const s2 = createConnection({ path: listener.socketPath });
    await Promise.all([
      new Promise<void>((r) => s1.on('connect', r)),
      new Promise<void>((r) => s2.on('connect', r)),
    ]);

    s1.write(serialize({ type: 'from-s1', payload: {}, timestamp: '' }));
    s2.write(serialize({ type: 'from-s2', payload: {}, timestamp: '' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBe(2);
    s1.destroy();
    s2.destroy();
  });
});
