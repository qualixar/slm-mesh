/**
 * SLM Mesh — SQLite BackendAdapter Implementation
 * Extracts all SQL logic into a clean class implementing BackendAdapter.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import type Database from 'better-sqlite3';
import type { BackendAdapter } from './backend.js';
import type {
  Peer,
  PeerId,
  PeerRegistration,
  PeerScope,
  Message,
  StateEntry,
  Lock,
  MeshEvent,
  PeerRow,
  MessageRow,
  StateRow,
  LockRow,
  EventRow,
} from '../types.js';
import {
  peerFromRow,
  messageFromRow,
  stateFromRow,
  lockFromRow,
  eventFromRow,
} from '../types.js';

export class SqliteBackend implements BackendAdapter {
  private readonly db: Database.Database;
  private readonly stmtLockGet: Database.Statement;
  private readonly stmtLockPeerName: Database.Statement;
  private readonly stmtLockDeleteByPath: Database.Statement;
  private readonly stmtLockDeleteExpiredByPath: Database.Statement;
  private readonly stmtLockMinutesRemaining: Database.Statement;
  private readonly stmtLockInsert: Database.Statement;
  private readonly stmtLockUnlock: Database.Statement;
  private readonly stmtLockCleanExpired: Database.Statement;
  private readonly stmtLockAll: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.stmtLockGet = this.db.prepare(
      'SELECT * FROM locks WHERE file_path = ?',
    );
    this.stmtLockPeerName = this.db.prepare(
      'SELECT name FROM peers WHERE id = ?',
    );
    this.stmtLockDeleteByPath = this.db.prepare(
      'DELETE FROM locks WHERE file_path = ?',
    );
    this.stmtLockDeleteExpiredByPath = this.db.prepare(
      "DELETE FROM locks WHERE file_path = ? AND datetime(expires_at) <= datetime('now')",
    );
    this.stmtLockMinutesRemaining = this.db.prepare(
      "SELECT CAST(((julianday(expires_at) - julianday('now')) * 24 * 60) + 0.999999 AS INTEGER) AS minutes_left FROM locks WHERE file_path = ?",
    );
    this.stmtLockInsert = this.db.prepare(
      "INSERT INTO locks (file_path, locked_by, locked_at, expires_at, reason) VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' minutes'), ?)",
    );
    this.stmtLockUnlock = this.db.prepare(
      'DELETE FROM locks WHERE file_path = ? AND locked_by = ?',
    );
    this.stmtLockCleanExpired = this.db.prepare(
      "DELETE FROM locks WHERE datetime(expires_at) <= datetime('now')",
    );
    this.stmtLockAll = this.db.prepare('SELECT * FROM locks');
  }

  // --- Peers ---

  registerPeer(
    reg: PeerRegistration & { id: string; name: string },
  ): Peer {
    this.db.prepare(
      `INSERT INTO peers (id, name, pid, project_path, git_root, git_branch, agent_type, summary, uds_path, started_at, last_heartbeat, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, datetime('now'), datetime('now'), 'active')`,
    ).run(
      reg.id,
      reg.name,
      reg.pid,
      reg.projectPath,
      reg.gitRoot ?? null,
      reg.gitBranch ?? null,
      reg.agentType ?? 'unknown',
      reg.udsPath ?? null,
    );

    const row = this.db.prepare(
      'SELECT * FROM peers WHERE id = ?',
    ).get(reg.id) as PeerRow;

    return peerFromRow(row);
  }

  removePeer(id: PeerId): void {
    this.db.prepare('DELETE FROM peers WHERE id = ?').run(id);
  }

  listPeers(
    scope: PeerScope,
    projectPath?: string,
    gitRoot?: string,
    excludeId?: PeerId,
  ): Peer[] {
    let sql = "SELECT * FROM peers WHERE status = 'active'";
    const params: unknown[] = [];

    if (scope === 'directory' && projectPath) {
      sql += ' AND project_path = ?';
      params.push(projectPath);
    } else if (scope === 'repo' && gitRoot) {
      sql += ' AND git_root = ?';
      params.push(gitRoot);
    }

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const rows = this.db.prepare(sql).all(...params) as PeerRow[];
    return rows.map(peerFromRow);
  }

  updateHeartbeat(id: PeerId): boolean {
    const result = this.db.prepare(
      "UPDATE peers SET last_heartbeat = datetime('now'), status = 'active' WHERE id = ?",
    ).run(id);

    return result.changes > 0;
  }

  updateSummary(id: PeerId, summary: string): boolean {
    const result = this.db.prepare(
      'UPDATE peers SET summary = ? WHERE id = ?',
    ).run(summary, id);

    return result.changes > 0;
  }

  cleanStalePeers(staleThresholdSec: number): number {
    const result = this.db.prepare(
      `UPDATE peers SET status = 'stale'
       WHERE status = 'active'
         AND last_heartbeat < datetime('now', '-' || ? || ' seconds')`,
    ).run(String(staleThresholdSec));

    return result.changes;
  }

  cleanDeadPeers(deadThresholdSec: number): string[] {
    const rows = this.db.prepare(
      `SELECT id FROM peers
       WHERE status = 'stale'
         AND last_heartbeat < datetime('now', '-' || ? || ' seconds')`,
    ).all(String(deadThresholdSec)) as Array<{ id: string }>;

    const ids = rows.map((r) => r.id);

    for (const id of ids) {
      this.db.prepare('DELETE FROM locks WHERE locked_by = ?').run(id);
      this.db.prepare(
        "UPDATE peers SET status = 'dead' WHERE id = ?",
      ).run(id);
    }

    return ids;
  }

  // --- Messages ---

  sendMessage(msg: {
    id: string;
    fromPeer: string;
    toPeer: string | null;
    type: string;
    payload: string;
  }): void {
    this.db.prepare(
      `INSERT INTO messages (id, from_peer, to_peer, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).run(msg.id, msg.fromPeer, msg.toPeer, msg.type, msg.payload);
  }

  getMessages(
    peerId: PeerId,
    filter: string,
    from?: PeerId,
    limit?: number,
  ): Message[] {
    let sql = 'SELECT * FROM messages WHERE to_peer = ?';
    const params: unknown[] = [peerId];

    if (filter === 'unread') {
      sql += ' AND read_at IS NULL';
    }
    if (from) {
      sql += ' AND from_peer = ?';
      params.push(from);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit ?? 20);

    const rows = this.db.prepare(sql).all(...params) as MessageRow[];
    return rows.map(messageFromRow);
  }

  markDelivered(messageId: string): void {
    this.db.prepare(
      'UPDATE messages SET delivered = 1 WHERE id = ?',
    ).run(messageId);
  }

  markRead(messageIds: string[]): void {
    if (messageIds.length === 0) return;

    const placeholders = messageIds.map(() => '?').join(',');
    this.db.prepare(
      `UPDATE messages SET read_at = datetime('now') WHERE id IN (${placeholders})`,
    ).run(...messageIds);
  }

  // --- State ---

  getState(namespace: string, key: string): StateEntry | null {
    const row = this.db.prepare(
      'SELECT * FROM state WHERE namespace = ? AND key = ?',
    ).get(namespace, key) as StateRow | undefined;

    return row ? stateFromRow(row) : null;
  }

  setState(
    namespace: string,
    key: string,
    value: string,
    peerId: PeerId,
  ): StateEntry {
    this.db.prepare(
      `INSERT OR REPLACE INTO state (key, namespace, value, updated_by, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(key, namespace, value, peerId);

    const row = this.db.prepare(
      'SELECT * FROM state WHERE namespace = ? AND key = ?',
    ).get(namespace, key) as StateRow;

    return stateFromRow(row);
  }

  listState(namespace: string): StateEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM state WHERE namespace = ?',
    ).all(namespace) as StateRow[];

    return rows.map(stateFromRow);
  }

  deleteState(namespace: string, key: string): void {
    this.db.prepare(
      'DELETE FROM state WHERE namespace = ? AND key = ?',
    ).run(namespace, key);
  }

  // --- Locks ---

  lockFile(
    filePath: string,
    peerId: PeerId,
    reason: string,
    ttlMinutes: number,
  ): Lock | { error: string } {
    this.stmtLockDeleteExpiredByPath.run(filePath);
    const existing = this.stmtLockGet.get(filePath) as LockRow | undefined;

    if (existing) {
      const peer = this.stmtLockPeerName.get(existing.locked_by) as
        | { name: string }
        | undefined;
      const minutesLeft = this.stmtLockMinutesRemaining.get(filePath) as
        | { minutes_left: number | null }
        | undefined;
      const remaining = Math.max(1, minutesLeft?.minutes_left ?? 1);
      if (remaining > 0) {
        const peerName = peer?.name ?? existing.locked_by;
        return {
          error: `File locked by ${peerName} (${existing.reason || 'no reason'}). Expires in ${remaining} minutes.`,
        };
      }
      this.stmtLockDeleteByPath.run(filePath);
    }

    this.stmtLockInsert.run(filePath, peerId, ttlMinutes, reason);

    const lockRow = this.stmtLockGet.get(filePath) as LockRow;

    return lockFromRow(lockRow);
  }

  unlockFile(filePath: string, peerId: PeerId): boolean {
    const result = this.stmtLockUnlock.run(filePath, peerId);

    return result.changes > 0;
  }

  queryLocks(filePath?: string): Lock[] {
    // Clean expired locks first
    this.stmtLockCleanExpired.run();

    if (filePath) {
      const row = this.stmtLockGet.get(filePath) as LockRow | undefined;

      return row ? [lockFromRow(row)] : [];
    }

    const rows = this.stmtLockAll.all() as LockRow[];

    return rows.map(lockFromRow);
  }

  releasePeerLocks(peerId: PeerId): void {
    this.db.prepare(
      'DELETE FROM locks WHERE locked_by = ?',
    ).run(peerId);
  }

  // --- Events ---

  emitEvent(event: {
    id: string;
    type: string;
    payload: string;
    emittedBy: string;
  }): void {
    this.db.prepare(
      `INSERT INTO events (id, type, payload, emitted_by, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(event.id, event.type, event.payload, event.emittedBy);
  }

  getEvents(
    types?: string[],
    since?: string,
    limit?: number,
  ): MeshEvent[] {
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params: unknown[] = [];

    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }
    if (since) {
      sql += ' AND created_at > ?';
      params.push(since);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit ?? 50);

    const rows = this.db.prepare(sql).all(...params) as EventRow[];
    return rows.map(eventFromRow);
  }

  // --- Stats ---

  getStats(): {
    peers: { active: number; stale: number; total: number };
    messages: { total: number; undelivered: number };
    locks: { active: number };
    events: { total: number };
  } {
    const count = (sql: string, ...params: unknown[]): number =>
      (this.db.prepare(sql).get(...params) as { c: number }).c;

    return {
      peers: {
        active: count(
          "SELECT COUNT(*) as c FROM peers WHERE status = ?",
          'active',
        ),
        stale: count(
          "SELECT COUNT(*) as c FROM peers WHERE status = ?",
          'stale',
        ),
        total: count('SELECT COUNT(*) as c FROM peers'),
      },
      messages: {
        total: count('SELECT COUNT(*) as c FROM messages'),
        undelivered: count(
          'SELECT COUNT(*) as c FROM messages WHERE delivered = 0',
        ),
      },
      locks: {
        active: count('SELECT COUNT(*) as c FROM locks'),
      },
      events: {
        total: count('SELECT COUNT(*) as c FROM events'),
      },
    };
  }

  // --- Lifecycle ---

  close(): void {
    // No-op: the caller owns the Database instance lifecycle.
    // This method exists to satisfy the BackendAdapter contract
    // for backends that need cleanup (e.g., Redis disconnect).
  }
}
