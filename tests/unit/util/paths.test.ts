import { describe, it, expect, afterEach } from 'vitest';
import { validateSocketPath, ensureDir, peerSocketPath } from '../../../src/util/paths.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('validateSocketPath', () => {
  it('returns path unchanged when under 103 bytes', () => {
    const short = '/tmp/test.sock';
    expect(validateSocketPath(short)).toBe(short);
  });

  it('returns fallback path in tmp dir for paths over 103 bytes', () => {
    const longPath = '/very/long/path/' + 'a'.repeat(100) + '/peer-abc.sock';
    const result = validateSocketPath(longPath);
    expect(result).not.toBe(longPath);
    // Fallback puts socket in a shorter /tmp directory
    expect(result).toContain('slm-mesh-');
    expect(result).toContain('peer-abc.sock');
  });
});

describe('ensureDir', () => {
  let tempDir: string;
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates directory when it does not exist', () => {
    tempDir = join(tmpdir(), `slm-mesh-test-paths-${Date.now()}`);
    ensureDir(tempDir);
    expect(existsSync(tempDir)).toBe(true);
  });

  it('does not throw when directory already exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-test-paths-'));
    expect(() => ensureDir(tempDir)).not.toThrow();
  });
});

describe('peerSocketPath', () => {
  it('returns a .sock path in peersDir for valid UUID', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const result = peerSocketPath('/tmp/peers', uuid);
    expect(result).toContain(uuid + '.sock');
  });

  it('throws for invalid peer ID (path traversal attempt)', () => {
    expect(() => peerSocketPath('/tmp/peers', '../../../etc/passwd')).toThrow(/Invalid peer ID/);
  });

  it('throws for non-UUID peer ID', () => {
    expect(() => peerSocketPath('/tmp/peers', 'not-a-uuid')).toThrow(/Invalid peer ID/);
  });
});
