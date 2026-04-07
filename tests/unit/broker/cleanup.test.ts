/**
 * SLM Mesh — Stale peer cleanup tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import {
  markStalePeers,
  cleanDeadPeers,
  sweepStaleSockets,
} from '../../../src/broker/cleanup.js';

/** Minimal schema for cleanup tests */
function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE peers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      pid INTEGER NOT NULL DEFAULT 0,
      project_path TEXT NOT NULL DEFAULT '',
      git_root TEXT,
      git_branch TEXT,
      agent_type TEXT NOT NULL DEFAULT 'unknown',
      summary TEXT NOT NULL DEFAULT '',
      uds_path TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE locks (
      file_path TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL REFERENCES peers(id),
      locked_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      emitted_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertPeer(
  db: InstanceType<typeof Database>,
  id: string,
  status: string,
  heartbeatSecondsAgo: number,
): void {
  db.prepare(
    `INSERT INTO peers (id, name, pid, project_path, agent_type, status, last_heartbeat)
     VALUES (?, ?, 0, '/tmp', 'unknown', ?, datetime('now', '-' || ? || ' seconds'))`,
  ).run(id, `peer-${id}`, status, String(heartbeatSecondsAgo));
}

function insertLock(
  db: InstanceType<typeof Database>,
  filePath: string,
  lockedBy: string,
): void {
  db.prepare(
    `INSERT INTO locks (file_path, locked_by, expires_at)
     VALUES (?, ?, datetime('now', '+10 minutes'))`,
  ).run(filePath, lockedBy);
}

describe('cleanup', () => {
  // --- markStalePeers ---

  describe('markStalePeers', () => {
    it('marks active peers whose heartbeat is older than threshold as stale', () => {
      const db = createTestDb();
      // Peer heartbeat 60 seconds ago — stale threshold is 30s
      insertPeer(db, 'old-peer', 'active', 60);
      // Peer heartbeat 5 seconds ago — still fresh
      insertPeer(db, 'fresh-peer', 'active', 5);

      const count = markStalePeers(db, 30_000);
      expect(count).toBe(1);

      const oldRow = db.prepare('SELECT status FROM peers WHERE id = ?').get('old-peer') as { status: string };
      expect(oldRow.status).toBe('stale');

      const freshRow = db.prepare('SELECT status FROM peers WHERE id = ?').get('fresh-peer') as { status: string };
      expect(freshRow.status).toBe('active');
    });

    it('returns 0 when no peers are stale', () => {
      const db = createTestDb();
      insertPeer(db, 'fresh', 'active', 5);
      expect(markStalePeers(db, 30_000)).toBe(0);
    });
  });

  // --- cleanDeadPeers ---

  describe('cleanDeadPeers', () => {
    it('deletes stale peers, removes their locks, and emits peer_left events', () => {
      const db = createTestDb();
      // Stale peer with heartbeat 120s ago — dead threshold is 60s
      insertPeer(db, 'dead-peer', 'stale', 120);
      insertLock(db, '/tmp/file.ts', 'dead-peer');

      const cleaned = cleanDeadPeers(db, 60_000);
      expect(cleaned).toContain('dead-peer');

      // Peer should be fully deleted (not just marked dead)
      const row = db.prepare('SELECT * FROM peers WHERE id = ?').get('dead-peer');
      expect(row).toBeUndefined();

      const lockCount = db.prepare('SELECT COUNT(*) as cnt FROM locks WHERE locked_by = ?').get('dead-peer') as { cnt: number };
      expect(lockCount.cnt).toBe(0);

      // Should have emitted a peer_left event
      const event = db.prepare("SELECT * FROM events WHERE type = 'peer_left'").get() as { payload: string } | undefined;
      expect(event).toBeDefined();
      expect(JSON.parse(event!.payload)).toMatchObject({ peerId: 'dead-peer', reason: 'dead_timeout' });
    });

    it('does not affect active or recently-stale peers', () => {
      const db = createTestDb();
      insertPeer(db, 'stale-recent', 'stale', 30);
      insertLock(db, '/tmp/file2.ts', 'stale-recent');

      const cleaned = cleanDeadPeers(db, 60_000);
      expect(cleaned).toHaveLength(0);

      const row = db.prepare('SELECT status FROM peers WHERE id = ?').get('stale-recent') as { status: string };
      expect(row.status).toBe('stale');
    });
  });

  // --- sweepStaleSockets ---

  describe('sweepStaleSockets', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'slm-cleanup-test-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('removes socket files that refuse connections', () => {
      // Create fake .sock files (not real sockets)
      const sockPath = join(tmpDir, 'dead-peer.sock');
      writeFileSync(sockPath, '');

      const count = sweepStaleSockets(tmpDir);
      expect(count).toBe(1);
      expect(existsSync(sockPath)).toBe(false);
    });

    it('does not remove live socket files', async () => {
      const sockPath = join(tmpDir, 'live-peer.sock');

      // Create a real listening socket
      const server = createServer();
      await new Promise<void>((resolve) => {
        server.listen(sockPath, () => resolve());
      });

      try {
        const count = sweepStaleSockets(tmpDir);
        expect(count).toBe(0);
        expect(existsSync(sockPath)).toBe(true);
      } finally {
        server.close();
      }
    });

    it('returns 0 for empty directory', () => {
      expect(sweepStaleSockets(tmpDir)).toBe(0);
    });

    it('ignores non-.sock files', () => {
      writeFileSync(join(tmpDir, 'readme.txt'), 'hello');
      expect(sweepStaleSockets(tmpDir)).toBe(0);
    });
  });
});
