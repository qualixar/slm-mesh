/**
 * SLM Mesh — Handler Tests
 * Tests all 12 broker API handlers + pruneExpiredData.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { getSchemaSQL } from '../../../src/db/schema.js';
import { runMigrations } from '../../../src/db/migrations.js';
import { createHandlers } from '../../../src/broker/handlers.js';
import { PushManager } from '../../../src/broker/push/manager.js';
import type { MeshConfig } from '../../../src/config.js';

function setup() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(getSchemaSQL());
  runMigrations(db);
  const push = new PushManager();
  const subscriptions = new Map<string, string[]>();
  const config = { dbPath: ':memory:', dataDir: '/tmp/test' } as MeshConfig;
  const handlers = createHandlers({ db, push, startedAt: Date.now(), subscriptions, config });
  return { db, push, handlers, subscriptions };
}

function registerPeer(handlers: ReturnType<typeof createHandlers>, overrides?: Record<string, unknown>) {
  return handlers.handleRegister({ projectPath: '/tmp/test', pid: process.pid, ...overrides }) as {
    ok: boolean; peerId: string; name: string;
  };
}

// ============================================================
// handleHealth
// ============================================================
describe('handleHealth', () => {
  it('returns ok status with version and uptime', () => {
    const { handlers } = setup();
    const r = handlers.handleHealth();
    expect(r.status).toBe('ok');
    expect(r.version).toBeDefined();
    expect(typeof r.uptime).toBe('number');
    expect(r.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// handleStatus
// ============================================================
describe('handleStatus', () => {
  it('returns full status object with all fields', () => {
    const { handlers } = setup();
    const r = handlers.handleStatus();
    expect(r.status).toBe('ok');
    expect(r.peers).toMatchObject({ active: 0, stale: 0, total: 0 });
    expect(r.messages).toMatchObject({ total: 0, undelivered: 0 });
    expect(r.locks).toMatchObject({ active: 0 });
    expect(r.events).toMatchObject({ total: 0 });
    expect(r.db).toBeDefined();
    expect(r.port).toBe(0); // placeholder, caller sets this
  });

  it('reflects registered peers in counts', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    registerPeer(handlers, { pid: 2 });
    const r = handlers.handleStatus();
    expect(r.peers.active).toBe(2);
    expect(r.peers.total).toBe(2);
    expect(r.events.total).toBeGreaterThan(0); // peer_joined events
  });
});

// ============================================================
// handleRegister
// ============================================================
describe('handleRegister', () => {
  it('registers a peer with required fields', () => {
    const { handlers } = setup();
    const r = registerPeer(handlers);
    expect(r.ok).toBe(true);
    expect(r.peerId).toBeDefined();
    expect(r.name).toContain('peer-');
  });

  it('returns error when projectPath missing', () => {
    const { handlers } = setup();
    const r = handlers.handleRegister({ pid: 123 });
    expect(r.ok).toBe(false);
  });

  it('returns error when pid missing', () => {
    const { handlers } = setup();
    const r = handlers.handleRegister({ projectPath: '/tmp' });
    expect(r.ok).toBe(false);
  });

  it('uses custom name when provided', () => {
    const { handlers } = setup();
    const r = registerPeer(handlers, { name: 'my-agent' });
    expect(r.name).toBe('my-agent');
  });

  it('auto-generates name when name is "auto"', () => {
    const { handlers } = setup();
    const r = registerPeer(handlers, { name: 'auto' });
    expect(r.name).toContain('peer-');
  });

  it('stores optional git fields', () => {
    const { handlers } = setup();
    const r = registerPeer(handlers, { gitRoot: '/repo', gitBranch: 'main', agentType: 'claude-code' });
    expect(r.ok).toBe(true);
    const peers = handlers.handlePeers({ scope: 'repo', gitRoot: '/repo' });
    expect(peers.peers.length).toBe(1);
  });

  it('emits peer_joined event', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    const events = handlers.handleEvents({ action: 'read' });
    expect(events.events.some((e: { type: string }) => e.type === 'peer_joined')).toBe(true);
  });
});

// ============================================================
// handleUnregister
// ============================================================
describe('handleUnregister', () => {
  it('removes a registered peer', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    const r = handlers.handleUnregister({ peerId: reg.peerId });
    expect(r.ok).toBe(true);
    const peers = handlers.handlePeers({ scope: 'machine' });
    expect(peers.peers.length).toBe(0);
  });

  it('returns error when peerId missing', () => {
    const { handlers } = setup();
    expect(handlers.handleUnregister({}).ok).toBe(false);
  });

  it('cleans up locks held by peer', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: reg.peerId });
    handlers.handleUnregister({ peerId: reg.peerId });
    const locks = handlers.handleLock({ action: 'query' });
    expect(locks.locks.length).toBe(0);
  });

  it('cleans up event subscriptions', () => {
    const { handlers, subscriptions } = setup();
    const reg = registerPeer(handlers);
    handlers.handleEvents({ action: 'subscribe', peerId: reg.peerId, types: ['peer_joined'] });
    expect(subscriptions.has(reg.peerId)).toBe(true);
    handlers.handleUnregister({ peerId: reg.peerId });
    expect(subscriptions.has(reg.peerId)).toBe(false);
  });

  it('emits peer_left event', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    handlers.handleUnregister({ peerId: reg.peerId });
    const events = handlers.handleEvents({ action: 'read', types: ['peer_left'] });
    expect(events.events.length).toBeGreaterThan(0);
  });
});

// ============================================================
// handleHeartbeat
// ============================================================
describe('handleHeartbeat', () => {
  it('updates heartbeat for existing peer', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    expect(handlers.handleHeartbeat({ peerId: reg.peerId }).ok).toBe(true);
  });

  it('returns error for non-existent peer', () => {
    const { handlers } = setup();
    expect(handlers.handleHeartbeat({ peerId: 'ghost' }).ok).toBe(false);
  });

  it('returns error when peerId missing', () => {
    const { handlers } = setup();
    expect(handlers.handleHeartbeat({}).ok).toBe(false);
  });
});

// ============================================================
// handlePeers
// ============================================================
describe('handlePeers', () => {
  it('lists all active peers with machine scope', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    registerPeer(handlers, { pid: 2 });
    const r = handlers.handlePeers({ scope: 'machine' });
    expect(r.ok).toBe(true);
    expect(r.peers.length).toBe(2);
  });

  it('filters by directory scope', () => {
    const { handlers } = setup();
    registerPeer(handlers, { projectPath: '/a' });
    registerPeer(handlers, { projectPath: '/b' });
    const r = handlers.handlePeers({ scope: 'directory', projectPath: '/a' });
    expect(r.peers.length).toBe(1);
  });

  it('filters by repo scope', () => {
    const { handlers } = setup();
    registerPeer(handlers, { gitRoot: '/repo1' });
    registerPeer(handlers, { gitRoot: '/repo2' });
    const r = handlers.handlePeers({ scope: 'repo', gitRoot: '/repo1' });
    expect(r.peers.length).toBe(1);
  });

  it('excludes specified peer', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    registerPeer(handlers, { pid: 2 });
    const r = handlers.handlePeers({ excludeId: r1.peerId });
    expect(r.peers.length).toBe(1);
    expect(r.peers[0].id).not.toBe(r1.peerId);
  });

  it('defaults to machine scope', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    const r = handlers.handlePeers({});
    expect(r.peers.length).toBe(1);
  });
});

// ============================================================
// handleSummary
// ============================================================
describe('handleSummary', () => {
  it('updates peer summary', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    expect(handlers.handleSummary({ peerId: reg.peerId, summary: 'Working on auth' }).ok).toBe(true);
    const peers = handlers.handlePeers({ scope: 'machine' });
    expect(peers.peers[0].summary).toBe('Working on auth');
  });

  it('returns error when missing params', () => {
    const { handlers } = setup();
    expect(handlers.handleSummary({}).ok).toBe(false);
  });

  it('returns error for non-existent peer', () => {
    const { handlers } = setup();
    expect(handlers.handleSummary({ peerId: 'ghost', summary: 'x' }).ok).toBe(false);
  });

  it('rejects summary exceeding max length', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    const long = 'x'.repeat(2600);
    const r = handlers.handleSummary({ peerId: reg.peerId, summary: long });
    expect(r.ok).toBe(false);
  });
});

// ============================================================
// handleSend
// ============================================================
describe('handleSend', () => {
  it('sends direct message', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    const r = handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: 'hi' });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBeDefined();
  });

  it('broadcasts to all peers', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    registerPeer(handlers, { pid: 2 });
    registerPeer(handlers, { pid: 3 });
    const r = handlers.handleSend({ fromPeer: r1.peerId, toPeer: 'all', payload: 'hello all' });
    expect(r.ok).toBe(true);
    expect(r.messageIds.length).toBe(2); // broadcast to 2 other peers
  });

  it('returns error when target peer not found', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    const r = handlers.handleSend({ fromPeer: 'p1', toPeer: 'ghost', payload: 'hi' });
    expect(r.ok).toBe(false);
  });

  it('returns error when missing fields', () => {
    const { handlers } = setup();
    expect(handlers.handleSend({}).ok).toBe(false);
    expect(handlers.handleSend({ fromPeer: 'a' }).ok).toBe(false);
    expect(handlers.handleSend({ fromPeer: 'a', toPeer: 'b' }).ok).toBe(false);
  });

  it('rejects payload exceeding max size', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    const bigPayload = 'x'.repeat(70_000);
    const r = handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: bigPayload });
    expect(r.ok).toBe(false);
  });

  it('accepts custom message type', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    const r = handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: '{}', type: 'json' });
    expect(r.ok).toBe(true);
  });
});

// ============================================================
// handleMessages
// ============================================================
describe('handleMessages', () => {
  it('retrieves messages for a peer', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: 'hi' });
    const r = handlers.handleMessages({ peerId: r2.peerId });
    expect(r.ok).toBe(true);
    expect(r.messages.length).toBe(1);
    expect(r.messages[0].payload).toBe('hi');
  });

  it('marks fetched messages as read', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: 'hi' });
    handlers.handleMessages({ peerId: r2.peerId }); // marks read
    const r = handlers.handleMessages({ peerId: r2.peerId, filter: 'unread' });
    expect(r.messages.length).toBe(0);
  });

  it('returns all messages when filter is "all"', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: 'hi' });
    handlers.handleMessages({ peerId: r2.peerId }); // marks read
    const r = handlers.handleMessages({ peerId: r2.peerId, filter: 'all' });
    expect(r.messages.length).toBe(1);
  });

  it('filters by sender', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    const r3 = registerPeer(handlers, { pid: 3 });
    handlers.handleSend({ fromPeer: r1.peerId, toPeer: r3.peerId, payload: 'from r1' });
    handlers.handleSend({ fromPeer: r2.peerId, toPeer: r3.peerId, payload: 'from r2' });
    const r = handlers.handleMessages({ peerId: r3.peerId, from: r1.peerId, filter: 'all' });
    expect(r.messages.length).toBe(1);
    expect(r.messages[0].payload).toBe('from r1');
  });

  it('respects limit', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    for (let i = 0; i < 5; i++) {
      handlers.handleSend({ fromPeer: r1.peerId, toPeer: r2.peerId, payload: `msg-${i}` });
    }
    const r = handlers.handleMessages({ peerId: r2.peerId, limit: 2 });
    expect(r.messages.length).toBe(2);
  });

  it('returns error when peerId missing', () => {
    const { handlers } = setup();
    expect(handlers.handleMessages({}).ok).toBe(false);
  });
});

// ============================================================
// handleState
// ============================================================
describe('handleState', () => {
  it('set + get round-trip', () => {
    const { handlers } = setup();
    handlers.handleState({ action: 'set', key: 'k', value: 'v', peerId: 'p1' });
    const r = handlers.handleState({ action: 'get', key: 'k' });
    expect(r.ok).toBe(true);
    expect(r.entry.value).toBe('v');
  });

  it('list entries in namespace', () => {
    const { handlers } = setup();
    handlers.handleState({ action: 'set', key: 'a', value: '1', peerId: 'p1' });
    handlers.handleState({ action: 'set', key: 'b', value: '2', peerId: 'p1' });
    const r = handlers.handleState({ action: 'list' });
    expect(r.entries.length).toBe(2);
  });

  it('delete entry', () => {
    const { handlers } = setup();
    handlers.handleState({ action: 'set', key: 'k', value: 'v', peerId: 'p1' });
    handlers.handleState({ action: 'delete', key: 'k' });
    const r = handlers.handleState({ action: 'get', key: 'k' });
    expect(r.entry).toBeNull();
  });

  it('supports custom namespace', () => {
    const { handlers } = setup();
    handlers.handleState({ action: 'set', key: 'k', value: 'v1', peerId: 'p1', namespace: 'ns1' });
    handlers.handleState({ action: 'set', key: 'k', value: 'v2', peerId: 'p1', namespace: 'ns2' });
    const r1 = handlers.handleState({ action: 'get', key: 'k', namespace: 'ns1' });
    const r2 = handlers.handleState({ action: 'get', key: 'k', namespace: 'ns2' });
    expect(r1.entry.value).toBe('v1');
    expect(r2.entry.value).toBe('v2');
  });

  it('get returns null for missing key', () => {
    const { handlers } = setup();
    const r = handlers.handleState({ action: 'get', key: 'missing' });
    expect(r.entry).toBeNull();
  });

  it('emits state_changed event on set', () => {
    const { handlers } = setup();
    handlers.handleState({ action: 'set', key: 'k', value: 'v', peerId: 'p1' });
    const events = handlers.handleEvents({ action: 'read', types: ['state_changed'] });
    expect(events.events.length).toBeGreaterThan(0);
  });

  it('returns error for unknown action', () => {
    const { handlers } = setup();
    expect(handlers.handleState({ action: 'bogus' }).ok).toBe(false);
  });

  it('returns error when action missing', () => {
    const { handlers } = setup();
    expect(handlers.handleState({}).ok).toBe(false);
  });

  it('returns error when set missing required fields', () => {
    const { handlers } = setup();
    expect(handlers.handleState({ action: 'set' }).ok).toBe(false);
    expect(handlers.handleState({ action: 'set', key: 'k' }).ok).toBe(false);
    expect(handlers.handleState({ action: 'set', key: 'k', value: 'v' }).ok).toBe(false);
  });

  it('returns error when get missing key', () => {
    const { handlers } = setup();
    expect(handlers.handleState({ action: 'get' }).ok).toBe(false);
  });

  it('returns error when delete missing key', () => {
    const { handlers } = setup();
    expect(handlers.handleState({ action: 'delete' }).ok).toBe(false);
  });
});

// ============================================================
// handleLock
// ============================================================
describe('handleLock', () => {
  it('acquires a lock', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    const r = handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: reg.peerId });
    expect(r.ok).toBe(true);
    expect(r.lock).toBeDefined();
  });

  it('prevents double lock', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    const r2 = registerPeer(handlers, { pid: 2 });
    handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: r1.peerId });
    const r = handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: r2.peerId });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('locked');
  });

  it('unlocks a file', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: reg.peerId });
    const r = handlers.handleLock({ action: 'unlock', filePath: '/f.ts', peerId: reg.peerId });
    expect(r.ok).toBe(true);
  });

  it('returns error for unlock by wrong peer', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: r1.peerId });
    const r = handlers.handleLock({ action: 'unlock', filePath: '/f.ts', peerId: 'other' });
    expect(r.ok).toBe(false);
  });

  it('queries all locks', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    handlers.handleLock({ action: 'lock', filePath: '/a.ts', peerId: r1.peerId });
    handlers.handleLock({ action: 'lock', filePath: '/b.ts', peerId: r1.peerId });
    const r = handlers.handleLock({ action: 'query' });
    expect(r.locks.length).toBe(2);
  });

  it('queries specific file lock', () => {
    const { handlers } = setup();
    const r1 = registerPeer(handlers);
    handlers.handleLock({ action: 'lock', filePath: '/a.ts', peerId: r1.peerId });
    const r = handlers.handleLock({ action: 'query', filePath: '/a.ts' });
    expect(r.locks.length).toBe(1);
  });

  it('emits file_locked and file_unlocked events', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: reg.peerId });
    handlers.handleLock({ action: 'unlock', filePath: '/f.ts', peerId: reg.peerId });
    const events = handlers.handleEvents({ action: 'read' });
    const types = events.events.map((e: { type: string }) => e.type);
    expect(types).toContain('file_locked');
    expect(types).toContain('file_unlocked');
  });

  it('accepts custom TTL and reason', () => {
    const { handlers } = setup();
    const reg = registerPeer(handlers);
    const r = handlers.handleLock({ action: 'lock', filePath: '/f.ts', peerId: reg.peerId, ttlMinutes: 30, reason: 'refactoring' });
    expect(r.ok).toBe(true);
  });

  it('returns error for unknown action', () => {
    const { handlers } = setup();
    expect(handlers.handleLock({ action: 'bogus' }).ok).toBe(false);
  });

  it('returns error when action missing', () => {
    const { handlers } = setup();
    expect(handlers.handleLock({}).ok).toBe(false);
  });

  it('returns error when lock missing required fields', () => {
    const { handlers } = setup();
    expect(handlers.handleLock({ action: 'lock' }).ok).toBe(false);
    expect(handlers.handleLock({ action: 'lock', filePath: '/f' }).ok).toBe(false);
  });
});

// ============================================================
// handleEvents
// ============================================================
describe('handleEvents', () => {
  it('reads all events', () => {
    const { handlers } = setup();
    registerPeer(handlers); // generates peer_joined
    const r = handlers.handleEvents({ action: 'read' });
    expect(r.ok).toBe(true);
    expect(r.events.length).toBeGreaterThan(0);
  });

  it('filters events by type', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    const r = handlers.handleEvents({ action: 'read', types: ['peer_joined'] });
    expect(r.events.every((e: { type: string }) => e.type === 'peer_joined')).toBe(true);
  });

  it('filters events by since timestamp', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    // Use a timestamp far in the future to verify filtering works
    const future = new Date(Date.now() + 60_000).toISOString();
    const r = handlers.handleEvents({ action: 'read', since: future });
    expect(r.events.length).toBe(0); // nothing after future
  });

  it('respects limit', () => {
    const { handlers } = setup();
    for (let i = 0; i < 5; i++) registerPeer(handlers, { pid: i + 10 });
    const r = handlers.handleEvents({ action: 'read', limit: 2 });
    expect(r.events.length).toBe(2);
  });

  it('subscribes and unsubscribes', () => {
    const { handlers, subscriptions } = setup();
    const reg = registerPeer(handlers);
    handlers.handleEvents({ action: 'subscribe', peerId: reg.peerId, types: ['peer_joined'] });
    expect(subscriptions.has(reg.peerId)).toBe(true);
    handlers.handleEvents({ action: 'unsubscribe', peerId: reg.peerId });
    expect(subscriptions.has(reg.peerId)).toBe(false);
  });

  it('returns error for subscribe without peerId', () => {
    const { handlers } = setup();
    expect(handlers.handleEvents({ action: 'subscribe', types: ['x'] }).ok).toBe(false);
  });

  it('returns error for subscribe without types', () => {
    const { handlers } = setup();
    expect(handlers.handleEvents({ action: 'subscribe', peerId: 'p1' }).ok).toBe(false);
  });

  it('returns error for unsubscribe without peerId', () => {
    const { handlers } = setup();
    expect(handlers.handleEvents({ action: 'unsubscribe' }).ok).toBe(false);
  });

  it('returns error for unknown action', () => {
    const { handlers } = setup();
    expect(handlers.handleEvents({ action: 'bogus' }).ok).toBe(false);
  });

  it('defaults action to read', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    const r = handlers.handleEvents({});
    expect(r.ok).toBe(true);
  });
});

// ============================================================
// pruneExpiredData
// ============================================================
describe('pruneExpiredData', () => {
  it('runs without error on empty tables', () => {
    const { handlers } = setup();
    expect(() => handlers.pruneExpiredData()).not.toThrow();
  });

  it('runs without error with data present', () => {
    const { handlers } = setup();
    registerPeer(handlers);
    handlers.handleState({ action: 'set', key: 'k', value: 'v', peerId: 'p1' });
    expect(() => handlers.pruneExpiredData()).not.toThrow();
  });
});
