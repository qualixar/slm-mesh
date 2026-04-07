/**
 * SLM Mesh — Migration System
 * Uses PRAGMA user_version for tracking applied migrations.
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import type Database from 'better-sqlite3';
import { getSchemaSQL } from './schema.js';

export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: Database.Database) => void;
}

/** All migrations in version order. Add new migrations to the end. */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Create initial schema (peers, messages, state, locks, events)',
    up: (db: Database.Database): void => {
      db.exec(getSchemaSQL());
    },
  },
  {
    version: 2,
    description: 'Add indexes on peers.status, messages.delivered, messages.created_at (PERF-007/008/009)',
    up: (db: Database.Database): void => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_peers_status      ON peers (status);
        CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages (delivered);
        CREATE INDEX IF NOT EXISTS idx_messages_created   ON messages (created_at);
      `);
    },
  },
];

/**
 * Run all pending migrations against the database.
 * Reads current version from PRAGMA user_version, applies any
 * migrations with a higher version number, and records each
 * in the schema_version audit table.
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const applyMigration = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);

      db.pragma(`user_version = ${migration.version}`);

      // Record in audit table (schema_version was created by migration v1)
      db.prepare(
        'INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)'
      ).run(migration.version, new Date().toISOString());
    }
  });

  applyMigration();
}
