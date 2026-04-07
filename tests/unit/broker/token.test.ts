// Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
/**
 * SLM Mesh — Bearer token management tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateToken,
  writeTokenFile,
  readTokenFile,
  readTokenFileOrThrow,
  removeTokenFile,
} from '../../../src/broker/token.js';

describe('token', () => {
  let tmpDir: string;
  let tokenPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slm-token-test-'));
    tokenPath = join(tmpDir, 'broker.token');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- generateToken ---

  describe('generateToken', () => {
    it('returns a 64-character hex string', () => {
      const token = generateToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens on successive calls', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  // --- writeTokenFile ---

  describe('writeTokenFile', () => {
    it('creates the token file at the given path', () => {
      writeTokenFile(tokenPath, 'test-token');
      expect(existsSync(tokenPath)).toBe(true);
    });

    it('writes the token content correctly', () => {
      writeTokenFile(tokenPath, 'my-secret-token');
      const content = readFileSync(tokenPath, 'utf8');
      expect(content).toBe('my-secret-token');
    });

    it('sets file permissions to 0o600 (owner read/write only)', () => {
      writeTokenFile(tokenPath, 'restricted-token');
      const stat = statSync(tokenPath);
      // eslint-disable-next-line no-bitwise
      const perms = stat.mode & 0o777;
      expect(perms).toBe(0o600);
    });
  });

  // --- readTokenFile ---

  describe('readTokenFile', () => {
    it('returns the token when the file exists', () => {
      writeFileSync(tokenPath, 'existing-token', 'utf8');
      const token = readTokenFile(tokenPath);
      expect(token).toBe('existing-token');
    });

    it('returns null when the file does not exist', () => {
      const token = readTokenFile(join(tmpDir, 'nonexistent'));
      expect(token).toBeNull();
    });

    it('returns null for an empty file', () => {
      writeFileSync(tokenPath, '', 'utf8');
      const token = readTokenFile(tokenPath);
      expect(token).toBeNull();
    });

    it('trims whitespace from the token', () => {
      writeFileSync(tokenPath, '  token-with-spaces  \n', 'utf8');
      const token = readTokenFile(tokenPath);
      expect(token).toBe('token-with-spaces');
    });
  });

  // --- readTokenFileOrThrow ---

  describe('readTokenFileOrThrow', () => {
    it('returns the token when available', () => {
      writeFileSync(tokenPath, 'valid-token', 'utf8');
      const token = readTokenFileOrThrow(tokenPath);
      expect(token).toBe('valid-token');
    });

    it('throws when the file does not exist', () => {
      expect(() => readTokenFileOrThrow(join(tmpDir, 'missing'))).toThrow(
        /Cannot read broker token/,
      );
    });

    it('throws when the file is empty', () => {
      writeFileSync(tokenPath, '', 'utf8');
      expect(() => readTokenFileOrThrow(tokenPath)).toThrow(
        /Cannot read broker token/,
      );
    });
  });

  // --- removeTokenFile ---

  describe('removeTokenFile', () => {
    it('deletes the token file', () => {
      writeFileSync(tokenPath, 'to-delete', 'utf8');
      removeTokenFile(tokenPath);
      expect(existsSync(tokenPath)).toBe(false);
    });

    it('does not throw when the file does not exist', () => {
      expect(() => removeTokenFile(join(tmpDir, 'nonexistent'))).not.toThrow();
    });
  });
});
