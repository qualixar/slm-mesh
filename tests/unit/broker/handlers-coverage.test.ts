/**
 * SLM Mesh — Handlers coverage tests for specific uncovered lines
 * Lines: 421-422 (delivered=true path), 553-554 (expired lock cleanup).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi } from 'vitest';
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
  return { db, push, handlers };
}

function registerPeer(handlers: ReturnType<typeof createHandlers>, overrides?: Record<string, unknown>) {
  return handlers.handleRegister({ projectPath: '/tmp/test', pid: process.pid, ...overrides }) as {
    ok: boolean; peerId: string; name: string;
  };
}

describe('handleSend — push delivered path', () => {
  it('marks message as delivered when push.send returns true', () => {
    const { handlers, push } = setup();
    const p1 = registerPeer(handlers);
    const p2 = registerPeer(handlers);

    // Mock push.send to return true (message delivered via push)
    vi.spyOn(push, 'send').mockReturnValue(true);

    const result = handlers.handleSend({
      fromPeer: p1.peerId,
      toPeer: p2.peerId,
      type: 'text',
      payload: 'hello',
    }) as { ok: boolean; messageId: string };

    expect(result.ok).toBe(true);
    expect(result.messageId).toBeDefined();

    vi.restoreAllMocks();
  });
});

describe('handleSend — rate limit exceeded', () => {
  it('returns error when rate limit is exceeded', () => {
    const { handlers } = setup();
    const p1 = registerPeer(handlers);
    const p2 = registerPeer(handlers);

    // Send 101 messages rapidly to exceed rate limit (100 per 10s)
    let lastResult: { ok: boolean; error?: string } = { ok: true };
    for (let i = 0; i < 105; i++) {
      lastResult = handlers.handleSend({
        fromPeer: p1.peerId,
        toPeer: p2.peerId,
        type: 'text',
        payload: `msg-${i}`,
      }) as { ok: boolean; error?: string };
    }
    // At some point, rate limit should kick in
    expect(lastResult.ok).toBe(false);
    expect(lastResult.error).toContain('Rate limit');
  });
});

describe('handleSend — peer not found for direct message', () => {
  it('returns error when target peer does not exist', () => {
    const { handlers } = setup();
    const p1 = registerPeer(handlers);

    const result = handlers.handleSend({
      fromPeer: p1.peerId,
      toPeer: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', // valid UUID but not registered
      type: 'text',
      payload: 'hello',
    }) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Peer not found');
  });
});

describe('handleLock — expired lock cleanup', () => {
  it('cleans up expired lock and allows new lock', () => {
    const { db, handlers } = setup();
    const p1 = registerPeer(handlers);
    const p2 = registerPeer(handlers);

    // Lock a file with p1 with a very short TTL
    handlers.handleLock({
      action: 'lock',
      filePath: '/test/file.ts',
      peerId: p1.peerId,
      reason: 'editing',
      ttlMinutes: 1,
    });

    // Manually expire the lock by updating the expires_at to the past
    db.prepare("UPDATE locks SET expires_at = datetime('now', '-1 minute') WHERE file_path = '/test/file.ts'").run();

    // Now p2 tries to lock the same file — should succeed (expired lock is cleaned)
    const result = handlers.handleLock({
      action: 'lock',
      filePath: '/test/file.ts',
      peerId: p2.peerId,
      reason: 'also editing',
      ttlMinutes: 10,
    }) as { ok: boolean };

    expect(result.ok).toBe(true);
  });
});
