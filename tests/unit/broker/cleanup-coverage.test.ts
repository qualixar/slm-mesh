/**
 * SLM Mesh — Cleanup coverage tests
 * Covers: sweepStaleSockets error paths, unlink error, missing dir.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:net';
import { sweepStaleSockets } from '../../../src/broker/cleanup.js';

describe('sweepStaleSockets coverage', () => {
  let tempDir: string;
  let udsServer: Server | null = null;

  afterEach(() => {
    if (udsServer) { udsServer.close(); udsServer = null; }
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns 0 when peers dir does not exist', () => {
    const result = sweepStaleSockets('/nonexistent/path/peers');
    expect(result).toBe(0);
  });

  it('removes stale .sock files (regular files)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-sweep-'));
    writeFileSync(join(tempDir, 'stale.sock'), 'not a real socket');
    writeFileSync(join(tempDir, 'another.sock'), 'also stale');
    writeFileSync(join(tempDir, 'not-a-sock.txt'), 'ignore me');

    const cleaned = sweepStaleSockets(tempDir);
    expect(cleaned).toBe(2);
  });

  it('preserves live UDS sockets', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-sweep-live-'));
    const sockPath = join(tempDir, 'live.sock');
    udsServer = createServer(() => {});
    await new Promise<void>((r) => udsServer!.listen(sockPath, () => r()));

    const cleaned = sweepStaleSockets(tempDir);
    expect(cleaned).toBe(0);
  });

  it('handles unlink errors gracefully', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-sweep-err-'));
    const subDir = join(tempDir, 'sub.sock');
    mkdirSync(subDir); // directory named .sock — unlink will fail (EISDIR or EPERM)

    // sweepStaleSockets should not throw
    const cleaned = sweepStaleSockets(tempDir);
    // Might be 0 if stat says it's a dir, or might try to unlink and fail
    expect(typeof cleaned).toBe('number');
  });
});
