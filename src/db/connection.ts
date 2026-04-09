/**
 * SLM Mesh — Database Connection Manager
 * Opens, configures, checkpoints, and closes the SQLite database.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { unlinkSync, chmodSync, existsSync, statSync } from 'node:fs';
import { ensureDir } from '../util/paths.js';
import { log } from '../util/logger.js';
import type { MeshConfig } from '../config.js';
import { runMigrations } from './migrations.js';

/**
 * Open the mesh database with all production PRAGMAs configured.
 * Creates the data directory if it doesn't exist, runs pending
 * migrations, and returns a ready-to-use Database instance.
 */
export function openDatabase(config: MeshConfig): Database.Database {
  ensureDir(dirname(config.dbPath));

  const db = new Database(config.dbPath);

  // Secure file permissions (research: owner-only access)
  try { chmodSync(config.dbPath, 0o600); } catch { /* v8 ignore next */ /* best effort */ }

  configurePragmas(db);
  runMigrations(db);

  // PERF-019: Conditional integrity check — only run if WAL file is non-empty
  // (indicates unclean shutdown; clean shutdown does TRUNCATE checkpoint)
  if (needsIntegrityCheck(config.dbPath)) {
    /* v8 ignore next 6 -- only fires on actual database corruption */
    if (!integrityCheck(db)) {
      log('WARNING: Database integrity check failed — rebuilding');
      db.close();
      unlinkSync(config.dbPath);
      return openDatabase(config);
    }
    log('Integrity check passed after unclean shutdown detected');
  }

  log(`Database opened: ${config.dbPath}`);
  return db;
}

/**
 * Close the database cleanly: TRUNCATE checkpoint then close.
 */
export function closeDatabase(db: Database.Database): void {
  checkpointWal(db, 'TRUNCATE');
  db.close();
  log('Database closed');
}

/**
 * Execute a WAL checkpoint with the given mode.
 * Modes: PASSIVE (default), RESTART, TRUNCATE
 */
export function checkpointWal(
  db: Database.Database,
  mode: 'PASSIVE' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'
): void {
  db.pragma(`wal_checkpoint(${mode})`);
}

/**
 * Run a quick integrity check on the database.
 * Returns true if the database is healthy, false otherwise.
 */
export function integrityCheck(db: Database.Database): boolean {
  const result = db.pragma('quick_check', { simple: true }) as string;
  return result === 'ok';
}

/**
 * PERF-019: Check if integrity check is needed.
 * If a non-empty WAL file exists, it means the previous shutdown was unclean
 * (clean shutdown does TRUNCATE checkpoint which empties the WAL).
 */
function needsIntegrityCheck(dbPath: string): boolean {
  const walPath = dbPath + '-wal';
  try {
    if (!existsSync(walPath)) return false;
    const stat = statSync(walPath);
    return stat.size > 0;
    /* v8 ignore next 3 */
  } catch {
    return false;
  }
}

// --- Internal helpers ---

/** QA-020: Named constants for database PRAGMA configuration */
const BUSY_TIMEOUT_MS = 5_000;
const CACHE_SIZE_KB = -64_000; // Negative = KiB (64MB)
const JOURNAL_SIZE_LIMIT_BYTES = 67_108_864; // 64MB
const MMAP_SIZE_BYTES = 134_217_728; // 128MB

function configurePragmas(db: Database.Database): void {
  // WAL mode for concurrent reads — verify it actually took effect
  const walResult = db.pragma('journal_mode = WAL', {
    simple: true,
  }) as string;
  /* v8 ignore start -- defensive: WAL mode always succeeds with standard SQLite */
  if (walResult !== 'wal') {
    throw new Error(
      `Failed to set WAL mode: got '${walResult}' instead of 'wal'`
    );
  }
  /* v8 ignore stop */

  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.pragma('synchronous = NORMAL');
  db.pragma(`cache_size = ${CACHE_SIZE_KB}`);
  db.pragma(`journal_size_limit = ${JOURNAL_SIZE_LIMIT_BYTES}`);
  db.pragma('foreign_keys = ON');
  db.pragma('wal_autocheckpoint = 0');
  db.pragma(`mmap_size = ${MMAP_SIZE_BYTES}`);
  db.pragma('temp_store = MEMORY');
}
