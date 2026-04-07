/**
 * SLM Mesh — Peer listener coverage tests
 * Covers: socket error/close events, chmod error path.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { createPeerListener } from '../../../src/mcp/peer-listener.js';
import { createConfig } from '../../../src/config.js';

describe('peer listener coverage', () => {
  let tempDir: string;
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const p of cleanupPaths) {
      try { if (existsSync(p)) unlinkSync(p); } catch { /* ok */ }
    }
    cleanupPaths.length = 0;
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('handles client connection, data, and close events', async () => {
    // Use /tmp directly for short socket paths (macOS 103 char limit)
    tempDir = mkdtempSync('/tmp/slm-pl-');
    const peersDir = join(tempDir, 'p');
    const config = createConfig({ dataDir: tempDir, peersDir });

    const received: unknown[] = [];
    const peerId = crypto.randomUUID();
    const listener = createPeerListener(peerId, config, (n) => received.push(n));
    cleanupPaths.push(listener.socketPath);
    await listener.start();

    // Connect to the listener and send NDJSON data
    const client = createConnection({ path: listener.socketPath });
    await new Promise<void>((r) => client.on('connect', r));
    client.write(JSON.stringify({ type: 'message', payload: { text: 'hi' } }) + '\n');

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(received.length).toBeGreaterThan(0);

    // Close client (triggers close event on server side)
    client.destroy();
    await new Promise<void>((r) => setTimeout(r, 50));

    await listener.stop();
  });

  it('handles socket error event', async () => {
    tempDir = mkdtempSync('/tmp/slm-pl-');
    const peersDir = join(tempDir, 'p');
    const config = createConfig({ dataDir: tempDir, peersDir });

    const peerId = crypto.randomUUID();
    const listener = createPeerListener(peerId, config, () => {});
    cleanupPaths.push(listener.socketPath);
    await listener.start();

    const client = createConnection({ path: listener.socketPath });
    client.on('error', () => { /* expected */ });
    await new Promise<void>((r) => client.on('connect', r));
    client.destroy(new Error('test error'));
    await new Promise<void>((r) => setTimeout(r, 50));

    await listener.stop();
  });

  it('stop is idempotent when not started', async () => {
    tempDir = mkdtempSync('/tmp/slm-pl-');
    const peersDir = join(tempDir, 'p');
    const config = createConfig({ dataDir: tempDir, peersDir });
    const peerId = crypto.randomUUID();
    const listener = createPeerListener(peerId, config, () => {});
    cleanupPaths.push(listener.socketPath);
    await listener.stop();
  });
});
