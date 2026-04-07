/**
 * SLM Mesh — Test Database Helper
 * Creates in-memory SQLite databases with full schema for testing.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import Database from 'better-sqlite3';
import { getSchemaSQL } from '../../src/db/schema.js';

/**
 * Create a fully-initialized in-memory database with the complete schema.
 * Use this instead of partial schemas in individual tests.
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(getSchemaSQL());
  return db;
}

/**
 * Insert a test peer into the database.
 */
export function insertTestPeer(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    name: string;
    pid: number;
    projectPath: string;
    gitRoot: string | null;
    gitBranch: string | null;
    agentType: string;
    summary: string;
    udsPath: string | null;
    status: string;
    heartbeatSecondsAgo: number;
  }> = {},
): string {
  const id = overrides.id ?? `test-peer-${Math.random().toString(36).slice(2, 8)}`;
  const heartbeatAge = overrides.heartbeatSecondsAgo ?? 0;

  db.prepare(
    `INSERT INTO peers (id, name, pid, project_path, git_root, git_branch, agent_type, summary, uds_path, started_at, last_heartbeat, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '-' || ? || ' seconds'), ?)`,
  ).run(
    id,
    overrides.name ?? `peer-${id.slice(0, 6)}`,
    overrides.pid ?? process.pid,
    overrides.projectPath ?? '/tmp/test-project',
    overrides.gitRoot ?? null,
    overrides.gitBranch ?? null,
    overrides.agentType ?? 'unknown',
    overrides.summary ?? '',
    overrides.udsPath ?? null,
    String(heartbeatAge),
    overrides.status ?? 'active',
  );

  return id;
}

/**
 * Insert a test message into the database.
 */
export function insertTestMessage(
  db: Database.Database,
  overrides: Partial<{
    id: string;
    fromPeer: string;
    toPeer: string | null;
    type: string;
    payload: string;
    delivered: number;
    readAt: string | null;
  }> = {},
): string {
  const id = overrides.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    `INSERT INTO messages (id, from_peer, to_peer, type, payload, created_at, read_at, delivered)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
  ).run(
    id,
    overrides.fromPeer ?? 'sender',
    overrides.toPeer ?? 'receiver',
    overrides.type ?? 'text',
    overrides.payload ?? 'test message',
    overrides.readAt ?? null,
    overrides.delivered ?? 0,
  );
  return id;
}

/**
 * Insert a test lock into the database.
 */
export function insertTestLock(
  db: Database.Database,
  filePath: string,
  lockedBy: string,
  overrides: Partial<{
    reason: string;
    ttlMinutes: number;
  }> = {},
): void {
  const ttl = overrides.ttlMinutes ?? 10;
  db.prepare(
    `INSERT INTO locks (file_path, locked_by, locked_at, expires_at, reason)
     VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' minutes'), ?)`,
  ).run(filePath, lockedBy, String(ttl), overrides.reason ?? '');
}

/**
 * Insert a test state entry into the database.
 */
export function insertTestState(
  db: Database.Database,
  key: string,
  value: string,
  overrides: Partial<{
    namespace: string;
    updatedBy: string;
  }> = {},
): void {
  db.prepare(
    `INSERT OR REPLACE INTO state (key, namespace, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(key, overrides.namespace ?? 'default', value, overrides.updatedBy ?? 'test-peer');
}

/**
 * Count rows in a table.
 */
export function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;
}
