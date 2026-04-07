/**
 * SLM Mesh — PID file management tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writePidFile,
  readPidFile,
  removePidFile,
  isProcessAlive,
  isPidFileStale,
} from '../../../src/broker/pid.js';

describe('pid', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slm-pid-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- writePidFile ---

  describe('writePidFile', () => {
    it('creates file with correct PID', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writePidFile(pidPath, 12345);
      const content = readFileSync(pidPath, 'utf8');
      expect(content.trim()).toBe('12345');
    });

    it('fails if file already exists (EEXIST)', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, '99999');
      expect(() => writePidFile(pidPath, 12345)).toThrow();
    });
  });

  // --- readPidFile ---

  describe('readPidFile', () => {
    it('returns PID from valid file', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, '42');
      expect(readPidFile(pidPath)).toBe(42);
    });

    it('returns null for missing file', () => {
      expect(readPidFile(join(tmpDir, 'nonexistent.pid'))).toBeNull();
    });

    it('returns null for invalid content', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, 'not-a-number');
      expect(readPidFile(pidPath)).toBeNull();
    });
  });

  // --- removePidFile ---

  describe('removePidFile', () => {
    it('only removes if PID matches', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, '12345');
      const removed = removePidFile(pidPath, 12345);
      expect(removed).toBe(true);
      expect(existsSync(pidPath)).toBe(false);
    });

    it('does NOT remove if PID does not match', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, '12345');
      const removed = removePidFile(pidPath, 99999);
      expect(removed).toBe(false);
      expect(existsSync(pidPath)).toBe(true);
    });

    it('returns false if file does not exist', () => {
      const pidPath = join(tmpDir, 'nonexistent.pid');
      expect(removePidFile(pidPath, 1)).toBe(false);
    });
  });

  // --- isProcessAlive ---

  describe('isProcessAlive', () => {
    it('returns true for current process', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('returns false for non-existent PID', () => {
      // PID 999999 is extremely unlikely to exist
      expect(isProcessAlive(999999)).toBe(false);
    });
  });

  // --- isPidFileStale ---

  describe('isPidFileStale', () => {
    it('returns true for dead PID file', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, '999999');
      expect(isPidFileStale(pidPath)).toBe(true);
    });

    it('returns false for alive PID file', () => {
      const pidPath = join(tmpDir, 'broker.pid');
      writeFileSync(pidPath, String(process.pid));
      expect(isPidFileStale(pidPath)).toBe(false);
    });

    it('returns false if file does not exist', () => {
      expect(isPidFileStale(join(tmpDir, 'nonexistent.pid'))).toBe(false);
    });
  });
});
