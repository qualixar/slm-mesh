/**
 * SLM Mesh — BackendAdapter + SqliteBackend tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getSchemaSQL } from '../../../src/db/schema.js';
import { SqliteBackend } from '../../../src/adapters/sqlite-backend.js';
import type { BackendAdapter } from '../../../src/adapters/backend.js';
import type { PeerRegistration, PeerScope } from '../../../src/types.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(getSchemaSQL());
  return db;
}

function makeRegistration(overrides?: Partial<PeerRegistration>): PeerRegistration {
  return {
    pid: 1234,
    projectPath: '/tmp/project',
    gitRoot: '/tmp/project',
    gitBranch: 'main',
    agentType: 'claude-code',
    udsPath: null,
    ...overrides,
  };
}

describe('SqliteBackend', () => {
  let db: Database.Database;
  let backend: BackendAdapter;

  beforeEach(() => {
    db = createTestDb();
    backend = new SqliteBackend(db);
  });

  afterEach(() => {
    backend.close();
  });

  // --- Structural ---

  it('implements all BackendAdapter methods', () => {
    expect(typeof backend.registerPeer).toBe('function');
    expect(typeof backend.removePeer).toBe('function');
    expect(typeof backend.listPeers).toBe('function');
    expect(typeof backend.updateHeartbeat).toBe('function');
    expect(typeof backend.updateSummary).toBe('function');
    expect(typeof backend.cleanStalePeers).toBe('function');
    expect(typeof backend.cleanDeadPeers).toBe('function');
    expect(typeof backend.sendMessage).toBe('function');
    expect(typeof backend.getMessages).toBe('function');
    expect(typeof backend.markDelivered).toBe('function');
    expect(typeof backend.markRead).toBe('function');
    expect(typeof backend.getState).toBe('function');
    expect(typeof backend.setState).toBe('function');
    expect(typeof backend.listState).toBe('function');
    expect(typeof backend.deleteState).toBe('function');
    expect(typeof backend.lockFile).toBe('function');
    expect(typeof backend.unlockFile).toBe('function');
    expect(typeof backend.queryLocks).toBe('function');
    expect(typeof backend.releasePeerLocks).toBe('function');
    expect(typeof backend.emitEvent).toBe('function');
    expect(typeof backend.getEvents).toBe('function');
    expect(typeof backend.getStats).toBe('function');
    expect(typeof backend.close).toBe('function');
  });

  // --- Peers ---

  describe('registerPeer + listPeers round-trip', () => {
    it('registers a peer and retrieves it by machine scope', () => {
      const reg = makeRegistration();
      const peer = backend.registerPeer({ ...reg, id: 'p1', name: 'agent-1' });

      expect(peer.id).toBe('p1');
      expect(peer.name).toBe('agent-1');
      expect(peer.pid).toBe(1234);
      expect(peer.projectPath).toBe('/tmp/project');
      expect(peer.agentType).toBe('claude-code');
      expect(peer.status).toBe('active');

      const peers = backend.listPeers('machine');
      expect(peers).toHaveLength(1);
      expect(peers[0]!.id).toBe('p1');
    });

    it('filters by directory scope', () => {
      backend.registerPeer({ ...makeRegistration({ projectPath: '/a' }), id: 'p1', name: 'a1' });
      backend.registerPeer({ ...makeRegistration({ projectPath: '/b' }), id: 'p2', name: 'b1' });

      const peers = backend.listPeers('directory', '/a');
      expect(peers).toHaveLength(1);
      expect(peers[0]!.id).toBe('p1');
    });

    it('filters by repo scope', () => {
      backend.registerPeer({ ...makeRegistration({ gitRoot: '/repo-a' }), id: 'p1', name: 'a1' });
      backend.registerPeer({ ...makeRegistration({ gitRoot: '/repo-b' }), id: 'p2', name: 'b1' });

      const peers = backend.listPeers('repo', undefined, '/repo-a');
      expect(peers).toHaveLength(1);
      expect(peers[0]!.id).toBe('p1');
    });

    it('excludes specified peer id', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.registerPeer({ ...makeRegistration(), id: 'p2', name: 'a2' });

      const peers = backend.listPeers('machine', undefined, undefined, 'p1');
      expect(peers).toHaveLength(1);
      expect(peers[0]!.id).toBe('p2');
    });
  });

  describe('removePeer', () => {
    it('removes a peer from the database', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.removePeer('p1');

      const peers = backend.listPeers('machine');
      expect(peers).toHaveLength(0);
    });
  });

  describe('updateHeartbeat', () => {
    it('returns true and updates heartbeat for existing peer', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      const result = backend.updateHeartbeat('p1');
      expect(result).toBe(true);
    });

    it('returns false for non-existent peer', () => {
      expect(backend.updateHeartbeat('ghost')).toBe(false);
    });
  });

  describe('updateSummary', () => {
    it('updates summary for existing peer', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      const result = backend.updateSummary('p1', 'Working on feature X');
      expect(result).toBe(true);

      const peers = backend.listPeers('machine');
      expect(peers[0]!.summary).toBe('Working on feature X');
    });

    it('returns false for non-existent peer', () => {
      expect(backend.updateSummary('ghost', 'nope')).toBe(false);
    });
  });

  // --- Messages ---

  describe('sendMessage + getMessages round-trip', () => {
    it('sends a message and retrieves it', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.registerPeer({ ...makeRegistration(), id: 'p2', name: 'a2' });

      backend.sendMessage({
        id: 'msg-1',
        fromPeer: 'p1',
        toPeer: 'p2',
        type: 'text',
        payload: 'hello',
      });

      const messages = backend.getMessages('p2', 'all');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe('msg-1');
      expect(messages[0]!.fromPeer).toBe('p1');
      expect(messages[0]!.payload).toBe('hello');
      expect(messages[0]!.delivered).toBe(false);
    });

    it('filters unread messages', () => {
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'first' });
      backend.sendMessage({ id: 'msg-2', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'second' });
      backend.markRead(['msg-1']);

      const unread = backend.getMessages('p2', 'unread');
      expect(unread).toHaveLength(1);
      expect(unread[0]!.id).toBe('msg-2');
    });

    it('filters by from peer', () => {
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: 'p3', type: 'text', payload: 'from-p1' });
      backend.sendMessage({ id: 'msg-2', fromPeer: 'p2', toPeer: 'p3', type: 'text', payload: 'from-p2' });

      const messages = backend.getMessages('p3', 'all', 'p1');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.fromPeer).toBe('p1');
    });

    it('respects limit', () => {
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'a' });
      backend.sendMessage({ id: 'msg-2', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'b' });
      backend.sendMessage({ id: 'msg-3', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'c' });

      const messages = backend.getMessages('p2', 'all', undefined, 2);
      expect(messages).toHaveLength(2);
    });

    it('handles broadcast messages (toPeer null)', () => {
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: null, type: 'alert', payload: 'broadcast' });

      // Broadcast messages have null toPeer — getMessages filters by toPeer, so
      // we test that sendMessage doesn't throw and the data is stored
      const row = db.prepare('SELECT * FROM messages WHERE id = ?').get('msg-1') as { to_peer: string | null };
      expect(row.to_peer).toBeNull();
    });
  });

  describe('markDelivered', () => {
    it('marks a message as delivered', () => {
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'hi' });
      backend.markDelivered('msg-1');

      const messages = backend.getMessages('p2', 'all');
      expect(messages[0]!.delivered).toBe(true);
    });
  });

  describe('markRead', () => {
    it('marks multiple messages as read', () => {
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'a' });
      backend.sendMessage({ id: 'msg-2', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'b' });
      backend.markRead(['msg-1', 'msg-2']);

      const unread = backend.getMessages('p2', 'unread');
      expect(unread).toHaveLength(0);
    });

    it('handles empty array gracefully', () => {
      expect(() => backend.markRead([])).not.toThrow();
    });
  });

  // --- State ---

  describe('setState + getState round-trip', () => {
    it('sets and retrieves state', () => {
      const entry = backend.setState('default', 'color', 'blue', 'p1');
      expect(entry.key).toBe('color');
      expect(entry.namespace).toBe('default');
      expect(entry.value).toBe('blue');
      expect(entry.updatedBy).toBe('p1');

      const retrieved = backend.getState('default', 'color');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.value).toBe('blue');
    });

    it('returns null for non-existent key', () => {
      expect(backend.getState('default', 'nope')).toBeNull();
    });

    it('overwrites existing state', () => {
      backend.setState('ns', 'k', 'v1', 'p1');
      backend.setState('ns', 'k', 'v2', 'p2');

      const entry = backend.getState('ns', 'k');
      expect(entry!.value).toBe('v2');
      expect(entry!.updatedBy).toBe('p2');
    });
  });

  describe('listState', () => {
    it('lists all entries in a namespace', () => {
      backend.setState('ns', 'a', '1', 'p1');
      backend.setState('ns', 'b', '2', 'p1');
      backend.setState('other', 'c', '3', 'p1');

      const entries = backend.listState('ns');
      expect(entries).toHaveLength(2);
    });
  });

  describe('deleteState', () => {
    it('removes a state entry', () => {
      backend.setState('ns', 'k', 'v', 'p1');
      backend.deleteState('ns', 'k');
      expect(backend.getState('ns', 'k')).toBeNull();
    });
  });

  // --- Locks ---

  describe('lockFile + queryLocks + unlockFile flow', () => {
    it('acquires, queries, and releases a lock', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      const result = backend.lockFile('/tmp/file.ts', 'p1', 'editing', 10);

      // Should return a Lock (not an error)
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.filePath).toBe('/tmp/file.ts');
        expect(result.lockedBy).toBe('p1');
        expect(result.reason).toBe('editing');
      }

      const locks = backend.queryLocks('/tmp/file.ts');
      expect(locks).toHaveLength(1);

      const unlocked = backend.unlockFile('/tmp/file.ts', 'p1');
      expect(unlocked).toBe(true);

      const afterUnlock = backend.queryLocks('/tmp/file.ts');
      expect(afterUnlock).toHaveLength(0);
    });
  });

  describe('lockFile conflict returns error', () => {
    it('returns error when file is already locked by another peer', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'agent-1' });
      backend.registerPeer({ ...makeRegistration(), id: 'p2', name: 'agent-2' });

      backend.lockFile('/tmp/file.ts', 'p1', 'editing', 10);
      const result = backend.lockFile('/tmp/file.ts', 'p2', 'also editing', 10);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('agent-1');
      }
    });

    it('allows locking an expired lock', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.registerPeer({ ...makeRegistration(), id: 'p2', name: 'a2' });

      // Insert lock with expired time directly
      db.prepare(
        "INSERT INTO locks (file_path, locked_by, locked_at, expires_at, reason) VALUES (?, ?, datetime('now'), datetime('now', '-1 minute'), 'old')",
      ).run('/tmp/expired.ts', 'p1');

      const result = backend.lockFile('/tmp/expired.ts', 'p2', 'new lock', 10);
      expect('error' in result).toBe(false);
    });
  });

  describe('unlockFile', () => {
    it('returns false when lock does not exist', () => {
      expect(backend.unlockFile('/tmp/nope.ts', 'p1')).toBe(false);
    });

    it('returns false when lock is owned by different peer', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.lockFile('/tmp/file.ts', 'p1', 'mine', 10);

      expect(backend.unlockFile('/tmp/file.ts', 'p2')).toBe(false);
    });
  });

  describe('queryLocks', () => {
    it('returns all locks when no filePath specified', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.lockFile('/a.ts', 'p1', 'a', 10);
      backend.lockFile('/b.ts', 'p1', 'b', 10);

      const locks = backend.queryLocks();
      expect(locks).toHaveLength(2);
    });

    it('cleans expired locks before querying', () => {
      db.prepare(
        "INSERT INTO locks (file_path, locked_by, locked_at, expires_at, reason) VALUES (?, ?, datetime('now'), datetime('now', '-1 minute'), 'old')",
      ).run('/tmp/expired.ts', 'p1');

      const locks = backend.queryLocks();
      expect(locks).toHaveLength(0);
    });
  });

  describe('releasePeerLocks', () => {
    it('releases all locks owned by a peer', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.lockFile('/a.ts', 'p1', 'a', 10);
      backend.lockFile('/b.ts', 'p1', 'b', 10);

      backend.releasePeerLocks('p1');

      const locks = backend.queryLocks();
      expect(locks).toHaveLength(0);
    });
  });

  // --- Events ---

  describe('emitEvent + getEvents round-trip', () => {
    it('emits an event and retrieves it', () => {
      backend.emitEvent({
        id: 'evt-1',
        type: 'peer_joined',
        payload: JSON.stringify({ peerId: 'p1' }),
        emittedBy: 'p1',
      });

      const events = backend.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.id).toBe('evt-1');
      expect(events[0]!.type).toBe('peer_joined');
      expect(events[0]!.emittedBy).toBe('p1');
    });

    it('filters events by type', () => {
      backend.emitEvent({ id: 'e1', type: 'peer_joined', payload: '{}', emittedBy: 'p1' });
      backend.emitEvent({ id: 'e2', type: 'file_locked', payload: '{}', emittedBy: 'p1' });

      const events = backend.getEvents(['peer_joined']);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('peer_joined');
    });

    it('filters events since a timestamp', () => {
      backend.emitEvent({ id: 'e1', type: 'test', payload: '{}', emittedBy: 'p1' });

      // Get events since the future — should be empty
      const events = backend.getEvents(undefined, '2099-01-01T00:00:00Z');
      expect(events).toHaveLength(0);
    });

    it('respects limit', () => {
      backend.emitEvent({ id: 'e1', type: 'test', payload: '{}', emittedBy: 'p1' });
      backend.emitEvent({ id: 'e2', type: 'test', payload: '{}', emittedBy: 'p1' });
      backend.emitEvent({ id: 'e3', type: 'test', payload: '{}', emittedBy: 'p1' });

      const events = backend.getEvents(undefined, undefined, 2);
      expect(events).toHaveLength(2);
    });
  });

  // --- Cleanup ---

  describe('cleanStalePeers', () => {
    it('marks active peers as stale when heartbeat is old', () => {
      // Insert peer with old heartbeat directly
      db.prepare(
        `INSERT INTO peers (id, name, pid, project_path, agent_type, status, started_at, last_heartbeat)
         VALUES (?, ?, 0, '/tmp', 'unknown', 'active', datetime('now'), datetime('now', '-60 seconds'))`,
      ).run('old-peer', 'old');

      db.prepare(
        `INSERT INTO peers (id, name, pid, project_path, agent_type, status, started_at, last_heartbeat)
         VALUES (?, ?, 0, '/tmp', 'unknown', 'active', datetime('now'), datetime('now'))`,
      ).run('fresh-peer', 'fresh');

      const count = backend.cleanStalePeers(30);
      expect(count).toBe(1);

      const row = db.prepare('SELECT status FROM peers WHERE id = ?').get('old-peer') as { status: string };
      expect(row.status).toBe('stale');
    });

    it('returns 0 when no peers are stale', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'fresh' });
      expect(backend.cleanStalePeers(30)).toBe(0);
    });
  });

  describe('cleanDeadPeers', () => {
    it('removes dead peers and releases their locks', () => {
      db.prepare(
        `INSERT INTO peers (id, name, pid, project_path, agent_type, status, started_at, last_heartbeat)
         VALUES (?, ?, 0, '/tmp', 'unknown', 'stale', datetime('now'), datetime('now', '-120 seconds'))`,
      ).run('dead-peer', 'dead');

      db.prepare(
        "INSERT INTO locks (file_path, locked_by, locked_at, expires_at, reason) VALUES (?, ?, datetime('now'), datetime('now', '+10 minutes'), 'test')",
      ).run('/tmp/locked.ts', 'dead-peer');

      const removed = backend.cleanDeadPeers(60);
      expect(removed).toContain('dead-peer');

      const row = db.prepare('SELECT status FROM peers WHERE id = ?').get('dead-peer') as { status: string };
      expect(row.status).toBe('dead');

      const lockCount = db.prepare('SELECT COUNT(*) as c FROM locks WHERE locked_by = ?').get('dead-peer') as { c: number };
      expect(lockCount.c).toBe(0);
    });

    it('does not affect recently-stale peers', () => {
      db.prepare(
        `INSERT INTO peers (id, name, pid, project_path, agent_type, status, started_at, last_heartbeat)
         VALUES (?, ?, 0, '/tmp', 'unknown', 'stale', datetime('now'), datetime('now', '-10 seconds'))`,
      ).run('recent-stale', 'recent');

      const removed = backend.cleanDeadPeers(60);
      expect(removed).toHaveLength(0);
    });
  });

  // --- Stats ---

  describe('getStats', () => {
    it('returns correct counts', () => {
      backend.registerPeer({ ...makeRegistration(), id: 'p1', name: 'a1' });
      backend.registerPeer({ ...makeRegistration(), id: 'p2', name: 'a2' });
      backend.sendMessage({ id: 'msg-1', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'hi' });
      backend.sendMessage({ id: 'msg-2', fromPeer: 'p1', toPeer: 'p2', type: 'text', payload: 'there' });
      backend.markDelivered('msg-1');
      backend.lockFile('/tmp/file.ts', 'p1', 'editing', 10);
      backend.emitEvent({ id: 'e1', type: 'test', payload: '{}', emittedBy: 'p1' });

      const stats = backend.getStats();
      expect(stats.peers.active).toBe(2);
      expect(stats.peers.stale).toBe(0);
      expect(stats.peers.total).toBe(2);
      expect(stats.messages.total).toBe(2);
      expect(stats.messages.undelivered).toBe(1);
      expect(stats.locks.active).toBe(1);
      expect(stats.events.total).toBe(1);
    });

    it('returns zeros for empty database', () => {
      const stats = backend.getStats();
      expect(stats.peers.total).toBe(0);
      expect(stats.messages.total).toBe(0);
      expect(stats.locks.active).toBe(0);
      expect(stats.events.total).toBe(0);
    });
  });

  // --- Close ---

  describe('close', () => {
    it('does not throw', () => {
      // close is called in afterEach — just verify it's callable
      expect(() => {
        const localDb = createTestDb();
        const localBackend = new SqliteBackend(localDb);
        localBackend.close();
      }).not.toThrow();
    });
  });
});
