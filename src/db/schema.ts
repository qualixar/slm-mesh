/**
 * SLM Mesh — Database Schema Definitions
 * All tables, indexes, and constraints for the mesh SQLite database.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

/**
 * Returns the full SQL to create all mesh database tables and indexes.
 * Uses IF NOT EXISTS so it's safe to run on an already-initialized DB.
 */
export function getSchemaSQL(): string {
  return `
-- Audit trail for schema migrations
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL
);

-- Registered peer agents
CREATE TABLE IF NOT EXISTS peers (
  id              TEXT NOT NULL PRIMARY KEY,
  name            TEXT NOT NULL,
  pid             INTEGER NOT NULL,
  project_path    TEXT NOT NULL,
  git_root        TEXT,
  git_branch      TEXT,
  agent_type      TEXT NOT NULL CHECK (agent_type IN ('claude-code','cursor','aider','codex','windsurf','vscode','unknown')),
  summary         TEXT NOT NULL DEFAULT '',
  uds_path        TEXT,
  started_at      TEXT NOT NULL,
  last_heartbeat  TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('active','stale','dead')) DEFAULT 'active'
);

-- Inter-peer messages
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT    NOT NULL PRIMARY KEY,
  from_peer   TEXT    NOT NULL,
  to_peer     TEXT,
  type        TEXT    NOT NULL CHECK (type IN ('text','json','command','alert')),
  payload     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  read_at     TEXT,
  delivered   INTEGER NOT NULL DEFAULT 0
);

-- Shared key-value state (namespace + key composite PK)
CREATE TABLE IF NOT EXISTS state (
  key         TEXT NOT NULL,
  namespace   TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);

-- File-level locks
CREATE TABLE IF NOT EXISTS locks (
  file_path  TEXT NOT NULL PRIMARY KEY,
  locked_by  TEXT NOT NULL,
  locked_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reason     TEXT NOT NULL DEFAULT ''
);

-- System events
CREATE TABLE IF NOT EXISTS events (
  id         TEXT NOT NULL PRIMARY KEY,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  emitted_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_messages_to_peer  ON messages (to_peer);
CREATE INDEX IF NOT EXISTS idx_messages_unread   ON messages (to_peer, created_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_type       ON events (type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_created    ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_peers_status      ON peers (status);
CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages (delivered);
CREATE INDEX IF NOT EXISTS idx_messages_created  ON messages (created_at);
`.trim();
}
