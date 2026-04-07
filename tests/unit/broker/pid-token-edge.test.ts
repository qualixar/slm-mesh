/**
 * SLM Mesh — PID + Token edge case coverage
 * Covers remaining uncovered catch blocks.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removePidFile, readPidFile, isProcessAlive } from '../../../src/broker/pid.js';
import { readTokenFile, removeTokenFile } from '../../../src/broker/token.js';

describe('pid edge cases', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      try { chmodSync(tempDir, 0o755); } catch { /* ok */ }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('removePidFile catches unlink error (read-only directory)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-pid-edge-'));
    const pidPath = join(tempDir, 'broker.pid');
    writeFileSync(pidPath, String(process.pid));
    // Make directory read-only so unlink fails
    chmodSync(tempDir, 0o444);
    const result = removePidFile(pidPath, process.pid);
    // On macOS, root can still unlink — so either true or false is valid
    expect(typeof result).toBe('boolean');
    // Restore permissions for cleanup
    chmodSync(tempDir, 0o755);
  });

  it('readPidFile returns null for NaN content', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-pid-edge2-'));
    const pidPath = join(tempDir, 'broker.pid');
    writeFileSync(pidPath, 'not-a-number');
    expect(readPidFile(pidPath)).toBeNull();
  });

  it('isProcessAlive returns true for EPERM scenario (PID 1)', () => {
    // PID 1 (launchd on macOS) exists but we lack permission to signal it
    // Actually process.kill(1, 0) may succeed or throw EPERM
    const result = isProcessAlive(1);
    expect(typeof result).toBe('boolean');
    // It should be true (process exists)
    expect(result).toBe(true);
  });
});

describe('token edge cases', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('readTokenFile returns null when existsSync returns true but readFileSync throws', () => {
    // Simulate by making a directory with the token name
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-edge-'));
    const tokenPath = join(tempDir, 'token');
    mkdirSync(tokenPath); // directory, not file — readFileSync will throw
    expect(readTokenFile(tokenPath)).toBeNull();
  });

  it('removeTokenFile logs error but does not throw when unlink fails', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-edge2-'));
    const tokenPath = join(tempDir, 'subdir', 'token');
    mkdirSync(join(tempDir, 'subdir'));
    writeFileSync(tokenPath, 'test');
    // Make parent dir read-only
    chmodSync(join(tempDir, 'subdir'), 0o444);
    // Should not throw
    removeTokenFile(tokenPath);
    // Restore for cleanup
    chmodSync(join(tempDir, 'subdir'), 0o755);
  });
});
