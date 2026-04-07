/**
 * SLM Mesh — Token coverage tests
 * Covers: readTokenFile with empty content, readTokenFileOrThrow, removeTokenFile error.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readTokenFile,
  readTokenFileOrThrow,
  removeTokenFile,
  writeTokenFile,
} from '../../../src/broker/token.js';

describe('token coverage', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('readTokenFile returns null for empty file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-cov-'));
    const tokenPath = join(tempDir, 'token');
    writeFileSync(tokenPath, '');
    expect(readTokenFile(tokenPath)).toBeNull();
  });

  it('readTokenFile returns null for whitespace-only file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-cov2-'));
    const tokenPath = join(tempDir, 'token');
    writeFileSync(tokenPath, '   \n  ');
    expect(readTokenFile(tokenPath)).toBeNull();
  });

  it('readTokenFileOrThrow throws when file missing', () => {
    expect(() => readTokenFileOrThrow('/nonexistent/token')).toThrow(/Cannot read broker token/);
  });

  it('readTokenFileOrThrow returns token when file exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-cov3-'));
    const tokenPath = join(tempDir, 'token');
    writeFileSync(tokenPath, 'abc123');
    expect(readTokenFileOrThrow(tokenPath)).toBe('abc123');
  });

  it('removeTokenFile is safe when file does not exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-cov4-'));
    // Should not throw
    removeTokenFile(join(tempDir, 'nonexistent'));
  });

  it('removeTokenFile removes existing file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-cov5-'));
    const tokenPath = join(tempDir, 'token');
    writeTokenFile(tokenPath, 'test-token');
    expect(existsSync(tokenPath)).toBe(true);
    removeTokenFile(tokenPath);
    expect(existsSync(tokenPath)).toBe(false);
  });

  it('removeTokenFile handles error gracefully', () => {
    // Trying to remove a directory instead of file
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-token-cov6-'));
    // Should not throw — logs the error internally
    removeTokenFile(join(tempDir, 'sub', 'deep', 'nonexistent'));
  });
});
