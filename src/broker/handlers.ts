/**
 * SLM Mesh — Broker API Route Handlers
 * All 12 endpoint handlers for the broker HTTP API.
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import type Database from 'better-sqlite3';
import { statSync } from 'node:fs';
import { generateId } from '../util/uuid.js';
import { VERSION } from '../config.js';
import type { MeshConfig } from '../config.js';
import { PushManager } from './push/manager.js';
import {
  peerFromRow,
  messageFromRow,
  stateFromRow,
  lockFromRow,
  eventFromRow,
} from '../types.js';
import type { PeerRow, MessageRow, StateRow, LockRow, EventRow } from '../types.js';

// --- Constants ---

/** SEC-019: Max payload size for messages (64KB) */
const MAX_PAYLOAD_BYTES = 65_536;

/** SEC-020: Max summary length in characters */
const MAX_SUMMARY_CHARS = 1000;

/** SEC-005: Rate limiting — max requests per peer per window */
const RATE_LIMIT_MAX = 100;

/** SEC-005: Rate limiting — window duration in milliseconds */
const RATE_LIMIT_WINDOW_MS = 10_000;

/** SEC-017: UUID v4 regex for peer ID validation */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HandlerDeps {
  readonly db: Database.Database;
  readonly push: PushManager;
  readonly startedAt: number;
  /**
   * QA-007: The subscriptions Map is intentionally mutable.
   * Event subscriptions are inherently dynamic — peers subscribe and unsubscribe
   * at runtime. Immutable patterns (copy-on-write) would add overhead with no
   * safety benefit since this map is only accessed synchronously within the
   * single-threaded broker event loop.
   */
  readonly subscriptions: Map<string, string[]>;
  readonly config: MeshConfig;
}

// --- Rate Limiter (SEC-005) ---

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/** SEC-005: Check rate limit for a given peer. Returns true if allowed. */
function checkRateLimit(peerId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(peerId);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(peerId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

// --- Validation Helpers (QA-009) ---

function validateString(value: unknown, _fieldName: string): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function validateOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function validateNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** SEC-017: Validate that a peer ID is a valid UUID v4. */
function isValidPeerId(peerId: string): boolean {
  return UUID_V4_REGEX.test(peerId);
}

export function createHandlers(deps: HandlerDeps) {
  const { db, push, startedAt, subscriptions, config } = deps;

  // --- PERF-004/005: Pre-prepare ALL SQLite statements at creation time ---
  // Event insertion
  const stmtInsertEvent = db.prepare(
    "INSERT INTO events (id, type, payload, emitted_by, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
  );

  // Status queries
  const stmtCountActivePeers = db.prepare('SELECT COUNT(*) as c FROM peers WHERE status = ?');
  const stmtCountAllPeers = db.prepare('SELECT COUNT(*) as c FROM peers');
  const stmtCountAllMessages = db.prepare('SELECT COUNT(*) as c FROM messages');
  const stmtCountUndelivered = db.prepare('SELECT COUNT(*) as c FROM messages WHERE delivered = 0');
  const stmtCountActiveLocks = db.prepare('SELECT COUNT(*) as c FROM locks');
  const stmtCountAllEvents = db.prepare('SELECT COUNT(*) as c FROM events');

  // Register
  const stmtInsertPeer = db.prepare(
    `INSERT INTO peers (id, name, pid, project_path, git_root, git_branch, agent_type, summary, uds_path, started_at, last_heartbeat, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, datetime('now'), datetime('now'), 'active')`,
  );

  // Unregister
  const stmtDeleteLocksByPeer = db.prepare('DELETE FROM locks WHERE locked_by = ?');
  const stmtDeletePeer = db.prepare('DELETE FROM peers WHERE id = ?');

  // Heartbeat
  const stmtHeartbeat = db.prepare(
    "UPDATE peers SET last_heartbeat = datetime('now'), status = 'active' WHERE id = ?",
  );

  // Summary
  const stmtUpdateSummary = db.prepare('UPDATE peers SET summary = ? WHERE id = ?');

  // Send — broadcast helpers
  const stmtSelectActivePeersExcept = db.prepare(
    "SELECT id, uds_path FROM peers WHERE status = 'active' AND id != ?",
  );
  const stmtInsertMessage = db.prepare(
    'INSERT INTO messages (id, from_peer, to_peer, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const stmtMarkDelivered = db.prepare('UPDATE messages SET delivered = 1 WHERE id = ?');
  const stmtSelectActivePeerById = db.prepare(
    "SELECT id FROM peers WHERE id = ? AND status = 'active'",
  );

  // State
  const stmtStateGet = db.prepare('SELECT * FROM state WHERE namespace = ? AND key = ?');
  const stmtStateSet = db.prepare(
    "INSERT OR REPLACE INTO state (key, namespace, value, updated_by, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
  );
  const stmtStateList = db.prepare('SELECT * FROM state WHERE namespace = ?');
  const stmtStateDelete = db.prepare('DELETE FROM state WHERE namespace = ? AND key = ?');

  // Lock
  const stmtLockGet = db.prepare('SELECT * FROM locks WHERE file_path = ?');
  const stmtLockPeerName = db.prepare('SELECT name FROM peers WHERE id = ?');
  const stmtLockDeleteByPath = db.prepare('DELETE FROM locks WHERE file_path = ?');
  const stmtLockInsert = db.prepare(
    'INSERT INTO locks (file_path, locked_by, locked_at, expires_at, reason) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtLockUnlock = db.prepare('DELETE FROM locks WHERE file_path = ? AND locked_by = ?');
  const stmtLockCleanExpired = db.prepare("DELETE FROM locks WHERE expires_at < datetime('now')");
  const stmtLockAll = db.prepare('SELECT * FROM locks');

  // TTL cleanup (PERF-009)
  const stmtPruneOldMessages = db.prepare(
    "DELETE FROM messages WHERE created_at < datetime('now', '-24 hours')",
  );
  const stmtPruneOldEvents = db.prepare(
    "DELETE FROM events WHERE created_at < datetime('now', '-48 hours')",
  );

  function emitEvent(type: string, payload: Record<string, unknown>, emittedBy: string): void {
    const id = generateId();
    const payloadStr = JSON.stringify(payload);
    stmtInsertEvent.run(id, type, payloadStr, emittedBy);

    const notification = { type: 'event' as const, payload: { eventType: type, ...payload }, timestamp: new Date().toISOString() };
    // Push to subscribed peers
    /* v8 ignore start -- requires active event subscriptions */
    for (const [peerId, types] of subscriptions.entries()) {
      if (types.includes(type) || types.includes('*')) {
        push.send(peerId, notification);
      }
    }
    /* v8 ignore stop */
  }

  // --- GET /health ---
  function handleHealth() {
    return { status: 'ok', version: VERSION, uptime: Math.floor((Date.now() - startedAt) / 1000) };
  }

  // --- GET /status ---
  function handleStatus() {
    // Batched in a single transaction for performance (PERF-003 fix)
    const stats = db.transaction(() => ({
      activePeers: (stmtCountActivePeers.get('active') as { c: number }).c,
      stalePeers: (stmtCountActivePeers.get('stale') as { c: number }).c,
      totalPeers: (stmtCountAllPeers.get() as { c: number }).c,
      totalMessages: (stmtCountAllMessages.get() as { c: number }).c,
      undelivered: (stmtCountUndelivered.get() as { c: number }).c,
      activeLocks: (stmtCountActiveLocks.get() as { c: number }).c,
      totalEvents: (stmtCountAllEvents.get() as { c: number }).c,
    }))();
    const { activePeers, stalePeers, totalPeers, totalMessages, undelivered, activeLocks, totalEvents } = stats;

    let dbSize = 0;
    let walSize = 0;
    try { dbSize = statSync(config.dbPath).size; } catch { /* missing file */ }
    try { walSize = statSync(config.dbPath + '-wal').size; } catch { /* no WAL yet */ }

    return {
      status: 'ok',
      version: VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      pid: process.pid,
      port: 0, // Caller sets this
      peers: { active: activePeers, stale: stalePeers, total: totalPeers },
      messages: { total: totalMessages, undelivered },
      locks: { active: activeLocks },
      events: { total: totalEvents },
      db: { sizeBytes: dbSize, walSizeBytes: walSize },
    };
  }

  // --- POST /register ---
  function handleRegister(body: Record<string, unknown>) {
    const projectPath = validateString(body['projectPath'], 'projectPath');
    const pid = validateNumber(body['pid']);
    if (!projectPath || pid === undefined) {
      return { ok: false, error: 'projectPath and pid are required' };
    }

    const peerId = generateId();
    const rawName = validateOptionalString(body['name']) ?? 'auto';
    const name = rawName === 'auto' ? `peer-${peerId.slice(0, 6)}` : rawName;
    const gitRoot = validateOptionalString(body['gitRoot']) ?? null;
    const gitBranch = validateOptionalString(body['gitBranch']) ?? null;
    const agentType = validateOptionalString(body['agentType']) ?? 'unknown';
    const udsPath = validateOptionalString(body['udsPath']) ?? null;

    stmtInsertPeer.run(peerId, name, pid, projectPath, gitRoot, gitBranch, agentType, udsPath);

    if (udsPath) {
      push.connect(peerId, udsPath);
    }

    emitEvent('peer_joined', { peerId, name, agentType, projectPath }, peerId);

    return { ok: true, peerId, name };
  }

  // --- POST /unregister ---
  function handleUnregister(body: Record<string, unknown>) {
    const peerId = validateString(body['peerId'], 'peerId');
    if (!peerId) return { ok: false, error: 'peerId is required' };

    stmtDeleteLocksByPeer.run(peerId);
    stmtDeletePeer.run(peerId);
    push.disconnect(peerId);
    subscriptions.delete(peerId);

    emitEvent('peer_left', { peerId, reason: 'clean_exit' }, peerId);

    push.broadcast({
      type: 'peer_update',
      payload: { action: 'left', peerId },
      timestamp: new Date().toISOString(),
    });

    return { ok: true };
  }

  // --- POST /heartbeat ---
  function handleHeartbeat(body: Record<string, unknown>) {
    const peerId = validateString(body['peerId'], 'peerId');
    if (!peerId) return { ok: false, error: 'peerId is required' };

    // SEC-005: Rate limit per peer
    /* v8 ignore next 3 -- requires 100+ heartbeats in 10s window */
    if (!checkRateLimit(peerId)) {
      return { ok: false, error: 'Rate limit exceeded (max 100 requests per 10 seconds)' };
    }

    const result = stmtHeartbeat.run(peerId);

    if (result.changes === 0) {
      return { ok: false, error: 'Peer not found' };
    }
    return { ok: true };
  }

  // --- POST /peers ---
  function handlePeers(body: Record<string, unknown>) {
    const scope = validateOptionalString(body['scope']) ?? 'machine';
    const projectPath = validateOptionalString(body['projectPath']);
    const gitRoot = validateOptionalString(body['gitRoot']);
    const excludeId = validateOptionalString(body['excludeId']);

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

    // Dynamic SQL — cannot pre-prepare due to variable WHERE clauses
    const rows = db.prepare(sql).all(...params) as PeerRow[];
    return { ok: true, peers: rows.map(peerFromRow) };
  }

  // --- POST /summary ---
  function handleSummary(body: Record<string, unknown>) {
    const peerId = validateString(body['peerId'], 'peerId');
    const summary = validateOptionalString(body['summary']);
    if (!peerId || summary === undefined) return { ok: false, error: 'peerId and summary are required' };

    // SEC-020: Validate summary length
    if (summary.length > MAX_SUMMARY_CHARS) {
      return { ok: false, error: `Summary too long (max ${MAX_SUMMARY_CHARS} characters)` };
    }

    const result = stmtUpdateSummary.run(summary, peerId);
    if (result.changes === 0) return { ok: false, error: 'Peer not found' };
    return { ok: true };
  }

  // --- POST /send ---

  /**
   * QA-004: Extracted broadcast logic from handleSend.
   * Sends a message to all active peers except the sender, within a single transaction.
   */
  function broadcastMessage(
    fromPeer: string,
    type: string,
    payload: string,
    ts: string,
  ): { ok: true; messageIds: string[] } {
    const peers = stmtSelectActivePeersExcept.all(fromPeer) as PeerRow[];
    const messageIds: string[] = [];

    const broadcastTxn = db.transaction(() => {
      for (const peer of peers) {
        const msgId = generateId();
        stmtInsertMessage.run(msgId, fromPeer, peer.id, type, payload, ts);
        messageIds.push(msgId);

        const delivered = push.send(peer.id, {
          type: 'message',
          payload: { messageId: msgId, fromPeer, text: payload },
          timestamp: ts,
        });
        /* v8 ignore next 3 -- requires active push connection for broadcast */
        if (delivered) {
          stmtMarkDelivered.run(msgId);
        }
      }
    });
    broadcastTxn();

    emitEvent('message_received', { fromPeer, toPeer: 'all', count: messageIds.length }, fromPeer);
    return { ok: true, messageIds };
  }

  function handleSend(body: Record<string, unknown>) {
    const fromPeer = validateString(body['fromPeer'], 'fromPeer');
    const toPeer = validateString(body['toPeer'], 'toPeer');
    const payload = validateString(body['payload'], 'payload');
    const type = validateOptionalString(body['type']) ?? 'text';

    if (!fromPeer || !toPeer || !payload) {
      return { ok: false, error: 'fromPeer, toPeer, and payload are required' };
    }

    // SEC-019: Validate message payload size (max 64KB)
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      return { ok: false, error: `Payload too large (max ${MAX_PAYLOAD_BYTES} bytes)` };
    }

    // SEC-005: Rate limit per sender
    if (!checkRateLimit(fromPeer)) {
      return { ok: false, error: 'Rate limit exceeded (max 100 requests per 10 seconds)' };
    }

    const ts = new Date().toISOString();

    if (toPeer === 'all') {
      return broadcastMessage(fromPeer, type, payload, ts);
    }

    // SEC-017: Validate target peer ID format (skip for well-known IDs like 'cli')
    if (toPeer !== 'cli' && !isValidPeerId(toPeer)) {
      return { ok: false, error: 'Invalid peer ID format' };
    }

    // Direct message
    const target = stmtSelectActivePeerById.get(toPeer) as PeerRow | undefined;
    if (!target) {
      return { ok: false, error: 'Peer not found or inactive' };
    }

    const messageId = generateId();
    stmtInsertMessage.run(messageId, fromPeer, toPeer, type, payload, ts);

    const delivered = push.send(toPeer, {
      type: 'message',
      payload: { messageId, fromPeer, text: payload },
      timestamp: ts,
    });
    if (delivered) {
      stmtMarkDelivered.run(messageId);
    }

    emitEvent('message_received', { messageId, fromPeer, toPeer }, fromPeer);
    return { ok: true, messageId };
  }

  // --- POST /messages ---
  // PERF-006: SELECT + UPDATE wrapped in transaction for atomicity
  function handleMessages(body: Record<string, unknown>) {
    const peerId = validateString(body['peerId'], 'peerId');
    if (!peerId) return { ok: false, error: 'peerId is required' };

    const msgFilter = validateOptionalString(body['filter']) ?? 'unread';
    const from = validateOptionalString(body['from']);
    const limit = validateNumber(body['limit']) ?? 20;

    let sql = 'SELECT * FROM messages WHERE to_peer = ?';
    const params: unknown[] = [peerId];

    if (msgFilter === 'unread') {
      sql += ' AND read_at IS NULL';
    }
    if (from) {
      sql += ' AND from_peer = ?';
      params.push(from);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    // Wrap read + mark-read in a transaction for atomicity (PERF-006)
    const result = db.transaction(() => {
      const rows = db.prepare(sql).all(...params) as MessageRow[];
      const messages = rows.map(messageFromRow);

      // Mark as read
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE messages SET read_at = datetime('now') WHERE id IN (${placeholders})`).run(...ids);
      }

      return { ok: true as const, messages };
    })();

    return result;
  }

  // --- POST /state ---

  /** QA-006: Extracted state get action */
  function stateGet(key: string | undefined, namespace: string) {
    if (!key) return { ok: false, error: 'key is required for get' };
    const row = stmtStateGet.get(namespace, key) as StateRow | undefined;
    return { ok: true, entry: row ? stateFromRow(row) : null };
  }

  /** QA-006: Extracted state set action */
  function stateSet(key: string | undefined, value: string | undefined, peerId: string | undefined, namespace: string) {
    if (!key || value === undefined || !peerId) {
      return { ok: false, error: 'key, value, and peerId are required for set' };
    }
    stmtStateSet.run(key, namespace, value, peerId);

    const row = stmtStateGet.get(namespace, key) as StateRow;
    const entry = stateFromRow(row);

    emitEvent('state_changed', { key, namespace, value }, peerId);
    push.broadcast({
      type: 'peer_update',
      payload: { action: 'state_changed', key, namespace },
      timestamp: new Date().toISOString(),
    });

    return { ok: true, entry };
  }

  /** QA-006: Extracted state list action */
  function stateList(namespace: string) {
    const rows = stmtStateList.all(namespace) as StateRow[];
    return { ok: true, entries: rows.map(stateFromRow) };
  }

  /** QA-006: Extracted state delete action */
  function stateDelete(key: string | undefined, namespace: string) {
    if (!key) return { ok: false, error: 'key is required for delete' };
    stmtStateDelete.run(namespace, key);
    return { ok: true };
  }

  function handleState(body: Record<string, unknown>) {
    const action = validateString(body['action'], 'action');
    if (!action) return { ok: false, error: 'action is required' };

    const key = validateOptionalString(body['key']);
    const namespace = validateOptionalString(body['namespace']) ?? 'default';
    const value = validateOptionalString(body['value']);
    const peerId = validateOptionalString(body['peerId']);

    switch (action) {
      case 'get': return stateGet(key, namespace);
      case 'set': return stateSet(key, value, peerId, namespace);
      case 'list': return stateList(namespace);
      case 'delete': return stateDelete(key, namespace);
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  }

  // --- POST /lock ---

  /** QA-005: Extracted lock acquire logic */
  function acquireLock(filePath: string, peerId: string, body: Record<string, unknown>) {
    const reason = validateOptionalString(body['reason']) ?? '';
    const ttlMinutes = validateNumber(body['ttlMinutes']) ?? 10;

    // Check existing lock
    const existing = stmtLockGet.get(filePath) as LockRow | undefined;
    if (existing) {
      const expiresAt = new Date(existing.expires_at);
      if (expiresAt > new Date()) {
        const peer = stmtLockPeerName.get(existing.locked_by) as { name: string } | undefined;
        const peerName = peer?.name ?? existing.locked_by;
        const minutesLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 60_000);
        // API-026: Use "reason: X" format instead of "(X)"
        const reasonSuffix = existing.reason ? `, reason: ${existing.reason}` : '';
        return {
          ok: false,
          error: `File locked by ${peerName}${reasonSuffix}. Expires in ${minutesLeft} minutes.`,
        };
      }
      // Expired lock — clean up
      stmtLockDeleteByPath.run(filePath);
    }

    const now = new Date();
    const expires = new Date(now.getTime() + ttlMinutes * 60_000);
    stmtLockInsert.run(filePath, peerId, now.toISOString(), expires.toISOString(), reason);

    const lockRow = stmtLockGet.get(filePath) as LockRow;
    emitEvent('file_locked', { filePath, lockedBy: peerId, reason }, peerId);
    push.broadcast({
      type: 'lock_update',
      payload: { filePath, action: 'locked', by: peerId },
      timestamp: new Date().toISOString(),
    });

    return { ok: true, lock: lockFromRow(lockRow) };
  }

  /** QA-005: Extracted lock release logic */
  function releaseLock(filePath: string, peerId: string) {
    const result = stmtLockUnlock.run(filePath, peerId);
    if (result.changes === 0) return { ok: false, error: 'Lock not found or not owned by you' };

    emitEvent('file_unlocked', { filePath, unlockedBy: peerId }, peerId);
    push.broadcast({
      type: 'lock_update',
      payload: { filePath, action: 'unlocked' },
      timestamp: new Date().toISOString(),
    });
    return { ok: true };
  }

  /** QA-005: Extracted lock query logic */
  function queryLocks(filePath: string | undefined) {
    stmtLockCleanExpired.run();
    if (filePath) {
      const row = stmtLockGet.get(filePath) as LockRow | undefined;
      return { ok: true, locks: row ? [lockFromRow(row)] : [] };
    }
    const rows = stmtLockAll.all() as LockRow[];
    return { ok: true, locks: rows.map(lockFromRow) };
  }

  function handleLock(body: Record<string, unknown>) {
    const action = validateString(body['action'], 'action');
    if (!action) return { ok: false, error: 'action is required' };

    const filePath = validateOptionalString(body['filePath']);
    const peerId = validateOptionalString(body['peerId']);

    switch (action) {
      case 'lock': {
        if (!filePath || !peerId) return { ok: false, error: 'filePath and peerId are required for lock' };
        return acquireLock(filePath, peerId, body);
      }
      case 'unlock': {
        if (!filePath || !peerId) return { ok: false, error: 'filePath and peerId are required for unlock' };
        return releaseLock(filePath, peerId);
      }
      case 'query':
        return queryLocks(filePath);
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  }

  // --- POST /events ---
  function handleEvents(body: Record<string, unknown>) {
    const action = validateOptionalString(body['action']) ?? 'read';
    const peerId = validateOptionalString(body['peerId']);

    switch (action) {
      case 'read': {
        const types = Array.isArray(body['types']) ? body['types'] as string[] : undefined;
        const since = validateOptionalString(body['since']);
        const limit = validateNumber(body['limit']) ?? 50;

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
        params.push(limit);

        // Dynamic SQL — cannot pre-prepare due to variable IN clause
        const rows = db.prepare(sql).all(...params) as EventRow[];
        return { ok: true, events: rows.map(eventFromRow) };
      }
      case 'subscribe': {
        if (!peerId) return { ok: false, error: 'peerId is required for subscribe' };
        const types = Array.isArray(body['types']) ? body['types'] as string[] : undefined;
        if (!types || types.length === 0) return { ok: false, error: 'types array is required for subscribe' };
        subscriptions.set(peerId, types);
        return { ok: true, subscribed: types };
      }
      case 'unsubscribe': {
        if (!peerId) return { ok: false, error: 'peerId is required for unsubscribe' };
        subscriptions.delete(peerId);
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  }

  // --- PERF-009: TTL cleanup for unbounded tables ---
  function pruneExpiredData(): void {
    stmtPruneOldMessages.run();
    stmtPruneOldEvents.run();
  }

  return {
    handleHealth,
    handleStatus,
    handleRegister,
    handleUnregister,
    handleHeartbeat,
    handlePeers,
    handleSummary,
    handleSend,
    handleMessages,
    handleState,
    handleLock,
    handleEvents,
    pruneExpiredData,
  };
}
