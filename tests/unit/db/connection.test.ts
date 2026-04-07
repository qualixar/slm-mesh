/**
 * SLM Mesh — Connection Tests
 * TDD RED: Written before implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfig } from '../../../src/config.js';
import {
  openDatabase,
  closeDatabase,
  checkpointWal,
  integrityCheck,
} from '../../../src/db/connection.js';
import type Database from 'better-sqlite3';

describe('connection', () => {
  let tmpDir: string;
  let config: ReturnType<typeof createConfig>;
  let db: Database.Database | null = null;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slm-mesh-test-conn-'));
    config = createConfig({
      dataDir: tmpDir,
      dbPath: join(tmpDir, 'mesh.db'),
    });
  });

  afterEach(() => {
    if (db !== null) {
      try {
        db.close();
      } catch {
        // already closed
      }
      db = null;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('openDatabase', () => {
    it('creates the DB file at the config path', () => {
      db = openDatabase(config);
      expect(existsSync(config.dbPath)).toBe(true);
    });

    it('sets WAL journal mode', () => {
      db = openDatabase(config);
      const value = db.pragma('journal_mode', { simple: true }) as string;
      expect(value).toBe('wal');
    });

    it('sets busy_timeout to 5000', () => {
      db = openDatabase(config);
      const value = db.pragma('busy_timeout', { simple: true }) as number;
      expect(value).toBe(5000);
    });

    it('sets synchronous to NORMAL (1)', () => {
      db = openDatabase(config);
      const value = db.pragma('synchronous', { simple: true }) as number;
      expect(value).toBe(1); // NORMAL = 1
    });

    it('sets foreign_keys ON', () => {
      db = openDatabase(config);
      const value = db.pragma('foreign_keys', { simple: true }) as number;
      expect(value).toBe(1);
    });

    it('sets cache_size to -64000', () => {
      db = openDatabase(config);
      const value = db.pragma('cache_size', { simple: true }) as number;
      expect(value).toBe(-64000);
    });

    it('sets temp_store to MEMORY (2)', () => {
      db = openDatabase(config);
      const value = db.pragma('temp_store', { simple: true }) as number;
      expect(value).toBe(2); // MEMORY = 2
    });

    it('runs migrations (tables exist after open)', () => {
      db = openDatabase(config);
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .all() as Array<{ name: string }>;
      const names = tables.map((t) => t.name).sort();
      expect(names).toContain('peers');
      expect(names).toContain('messages');
      expect(names).toContain('events');
    });
  });

  describe('closeDatabase', () => {
    it('closes the database without error', () => {
      db = openDatabase(config);
      expect(() => closeDatabase(db!)).not.toThrow();
      // Verify it's closed by trying to use it
      expect(() => db!.prepare('SELECT 1')).toThrow();
      db = null; // prevent double-close in afterEach
    });
  });

  describe('checkpointWal', () => {
    it('executes without error (PASSIVE)', () => {
      db = openDatabase(config);
      expect(() => checkpointWal(db!)).not.toThrow();
    });

    it('executes with RESTART mode', () => {
      db = openDatabase(config);
      expect(() => checkpointWal(db!, 'RESTART')).not.toThrow();
    });

    it('executes with TRUNCATE mode', () => {
      db = openDatabase(config);
      expect(() => checkpointWal(db!, 'TRUNCATE')).not.toThrow();
    });
  });

  describe('integrityCheck', () => {
    it('returns true for a healthy database', () => {
      db = openDatabase(config);
      expect(integrityCheck(db!)).toBe(true);
    });
  });
});
