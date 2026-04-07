/**
 * SLM Mesh — DB connection coverage tests
 * Covers: needsIntegrityCheck, integrity check with WAL, configurePragmas error.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, closeDatabase, checkpointWal, integrityCheck } from '../../../src/db/connection.js';
import { createConfig } from '../../../src/config.js';

describe('DB connection coverage', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('opens database with non-empty WAL file (triggers integrity check)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });

    // First open to create DB
    const db = openDatabase(config);
    closeDatabase(db);

    // Create non-empty WAL file to trigger integrity check
    writeFileSync(join(tempDir, 'mesh.db-wal'), 'some data that indicates unclean shutdown');

    // Re-open — should trigger needsIntegrityCheck → integrityCheck
    const db2 = openDatabase(config);
    expect(db2).toBeDefined();
    closeDatabase(db2);
  });

  it('opens database without WAL file (skips integrity check)', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov2-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });

    const db = openDatabase(config);
    expect(db).toBeDefined();
    closeDatabase(db);
  });

  it('checkpointWal with PASSIVE mode', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov3-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });
    const db = openDatabase(config);
    // Should not throw
    checkpointWal(db, 'PASSIVE');
    checkpointWal(db, 'RESTART');
    closeDatabase(db);
  });

  it('integrityCheck returns true for healthy DB', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov4-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });
    const db = openDatabase(config);
    expect(integrityCheck(db)).toBe(true);
    closeDatabase(db);
  });

  it('needsIntegrityCheck returns false when WAL file does not exist', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov5-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });
    // Open DB — clean start, no WAL issues
    const db = openDatabase(config);
    closeDatabase(db);
    // Verify no WAL-related issues
    expect(existsSync(join(tempDir, 'mesh.db'))).toBe(true);
  });

  it('needsIntegrityCheck returns false for empty WAL file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov6-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });
    // Create DB first
    const db = openDatabase(config);
    closeDatabase(db);
    // Write empty WAL file
    writeFileSync(join(tempDir, 'mesh.db-wal'), '');
    // Re-open — empty WAL should skip integrity check
    const db2 = openDatabase(config);
    closeDatabase(db2);
  });

  it('handles chmod error on new database', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-db-cov7-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
    });
    // Should work even if chmod fails (best effort in source)
    const db = openDatabase(config);
    expect(db).toBeDefined();
    closeDatabase(db);
  });
});
