/**
 * SLM Mesh — Migrations Tests
 * TDD RED: Written before implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations } from '../../../src/db/migrations.js';

describe('runMigrations', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'slm-mesh-test-migrations-'));
    db = new Database(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates all tables on a fresh database', () => {
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      ['events', 'locks', 'messages', 'peers', 'schema_version', 'state'].sort()
    );
  });

  it('is idempotent — running twice does not error', () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('sets user_version to latest migration version after migration', () => {
    runMigrations(db);

    const result = db.pragma('user_version', { simple: true }) as number;
    // v2 adds indexes for peers.status, messages.delivered, messages.created_at
    expect(result).toBe(2);
  });

  it('inserts entries into schema_version for all migrations', () => {
    runMigrations(db);

    const rows = db
      .prepare('SELECT version, applied_at FROM schema_version ORDER BY version')
      .all() as Array<{ version: number; applied_at: string }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]!.version).toBe(1);
    expect(rows[0]!.applied_at).toBeTruthy();
    expect(rows[1]!.version).toBe(2);
    expect(rows[1]!.applied_at).toBeTruthy();
  });

  it('creates indexes', () => {
    runMigrations(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name).sort();
    expect(indexNames).toContain('idx_messages_to_peer');
    expect(indexNames).toContain('idx_messages_unread');
    expect(indexNames).toContain('idx_events_type');
    expect(indexNames).toContain('idx_events_created');
    // PERF-007/008/009: v2 indexes
    expect(indexNames).toContain('idx_peers_status');
    expect(indexNames).toContain('idx_messages_delivered');
    expect(indexNames).toContain('idx_messages_created');
  });
});
