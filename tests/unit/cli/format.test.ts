/**
 * SLM Mesh — CLI format tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect } from 'vitest';
import {
  formatPeers,
  formatMessages,
  formatLocks,
  formatEvents,
  formatStatus,
} from '../../../src/cli/format.js';
import type { Peer, Message, Lock, MeshEvent, BrokerStatus } from '../../../src/types.js';

// --- Test fixtures ---

function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    id: 'peer-abc123',
    name: 'claude-session-1',
    pid: 12345,
    projectPath: '/home/user/project',
    gitRoot: '/home/user/project',
    gitBranch: 'main',
    agentType: 'claude-code',
    summary: 'Working on feature X',
    udsPath: null,
    startedAt: '2026-04-07T10:00:00.000Z',
    lastHeartbeat: '2026-04-07T10:05:00.000Z',
    status: 'active',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-001',
    fromPeer: 'peer-abc',
    toPeer: 'peer-def',
    type: 'text',
    payload: 'Hello world',
    createdAt: '2026-04-07T10:00:00.000Z',
    readAt: null,
    delivered: false,
    ...overrides,
  };
}

function makeLock(overrides: Partial<Lock> = {}): Lock {
  return {
    filePath: '/home/user/project/src/app.ts',
    lockedBy: 'peer-abc',
    lockedAt: '2026-04-07T10:00:00.000Z',
    expiresAt: '2026-04-07T10:10:00.000Z',
    reason: 'Editing file',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<MeshEvent> = {}): MeshEvent {
  return {
    id: 'evt-001',
    type: 'peer.joined',
    payload: '{"name":"claude-session-1"}',
    emittedBy: 'peer-abc',
    createdAt: '2026-04-07T10:00:00.000Z',
    ...overrides,
  };
}

function makeStatus(overrides: Partial<BrokerStatus> = {}): BrokerStatus {
  return {
    status: 'ok',
    version: '1.0.0',
    uptime: 3600,
    pid: 99999,
    port: 7899,
    peers: { active: 2, stale: 1, total: 3 },
    messages: { total: 50, undelivered: 5 },
    locks: { active: 1 },
    events: { total: 120 },
    db: { sizeBytes: 102400, walSizeBytes: 4096 },
    ...overrides,
  };
}

// --- formatPeers ---

describe('formatPeers', () => {
  it('returns "No active peers" for empty array', () => {
    const result = formatPeers([]);
    expect(result).toBe('No active peers');
  });

  it('returns formatted table for single peer', () => {
    const result = formatPeers([makePeer()]);
    expect(result).toContain('peer-abc123');
    expect(result).toContain('claude-code');
    expect(result).toContain('active');
    expect(result).toContain('/home/user/project');
  });

  it('returns formatted table for multiple peers', () => {
    const peers = [
      makePeer({ id: 'peer-1', status: 'active', agentType: 'claude-code' }),
      makePeer({ id: 'peer-2', status: 'stale', agentType: 'cursor' }),
    ];
    const result = formatPeers(peers);
    expect(result).toContain('peer-1');
    expect(result).toContain('peer-2');
    expect(result).toContain('cursor');
    expect(result).toContain('stale');
  });

  it('includes header row', () => {
    const result = formatPeers([makePeer()]);
    expect(result).toContain('ID');
    expect(result).toContain('AGENT');
    expect(result).toContain('STATUS');
  });

  it('shows git branch when available', () => {
    const result = formatPeers([makePeer({ gitBranch: 'feature/xyz' })]);
    expect(result).toContain('feature/xyz');
  });

  it('handles null git branch gracefully', () => {
    const result = formatPeers([makePeer({ gitBranch: null })]);
    expect(result).toContain('-');
  });
});

// --- formatMessages ---

describe('formatMessages', () => {
  it('returns "No messages" for empty array', () => {
    const result = formatMessages([]);
    expect(result).toBe('No messages');
  });

  it('shows unread indicator for unread messages', () => {
    const result = formatMessages([makeMessage({ readAt: null })]);
    expect(result).toContain('*');
  });

  it('does not show unread indicator for read messages', () => {
    const result = formatMessages([makeMessage({ readAt: '2026-04-07T10:01:00.000Z' })]);
    expect(result).not.toContain('*');
  });

  it('shows message payload', () => {
    const result = formatMessages([makeMessage({ payload: 'Build failed' })]);
    expect(result).toContain('Build failed');
  });

  it('truncates long payloads', () => {
    const longPayload = 'A'.repeat(200);
    const result = formatMessages([makeMessage({ payload: longPayload })]);
    // Should be truncated with ellipsis
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(longPayload.length + 200);
  });

  it('includes header row', () => {
    const result = formatMessages([makeMessage()]);
    expect(result).toContain('ID');
    expect(result).toContain('FROM');
    expect(result).toContain('TYPE');
  });

  it('shows from and to peers', () => {
    const result = formatMessages([makeMessage({ fromPeer: 'peer-sender', toPeer: 'peer-recv' })]);
    expect(result).toContain('peer-sender');
    expect(result).toContain('peer-recv');
  });

  it('handles broadcast messages (null toPeer)', () => {
    const result = formatMessages([makeMessage({ toPeer: null })]);
    expect(result).toContain('all');
  });
});

// --- formatLocks ---

describe('formatLocks', () => {
  it('returns "No active locks" for empty array', () => {
    const result = formatLocks([]);
    expect(result).toBe('No active locks');
  });

  it('shows lock file path', () => {
    const result = formatLocks([makeLock()]);
    expect(result).toContain('/home/user/project/src/app.ts');
  });

  it('shows locked by and reason', () => {
    const result = formatLocks([makeLock({ lockedBy: 'peer-xyz', reason: 'Refactoring' })]);
    expect(result).toContain('peer-xyz');
    expect(result).toContain('Refactoring');
  });

  it('shows expiry information', () => {
    const result = formatLocks([makeLock({ expiresAt: '2026-04-07T10:10:00.000Z' })]);
    expect(result).toContain('2026-04-07');
  });

  it('includes header row', () => {
    const result = formatLocks([makeLock()]);
    expect(result).toContain('FILE');
    expect(result).toContain('LOCKED BY');
    expect(result).toContain('EXPIRES');
  });
});

// --- formatEvents ---

describe('formatEvents', () => {
  it('returns "No events" for empty array', () => {
    const result = formatEvents([]);
    expect(result).toBe('No events');
  });

  it('shows event type and emitter', () => {
    const result = formatEvents([makeEvent({ type: 'peer.joined', emittedBy: 'peer-abc' })]);
    expect(result).toContain('peer.joined');
    expect(result).toContain('peer-abc');
  });

  it('shows event id', () => {
    const result = formatEvents([makeEvent({ id: 'evt-special' })]);
    expect(result).toContain('evt-special');
  });

  it('includes header row', () => {
    const result = formatEvents([makeEvent()]);
    expect(result).toContain('ID');
    expect(result).toContain('TYPE');
    expect(result).toContain('EMITTED BY');
  });

  it('handles multiple events', () => {
    const events = [
      makeEvent({ id: 'evt-1', type: 'peer.joined' }),
      makeEvent({ id: 'evt-2', type: 'message.sent' }),
    ];
    const result = formatEvents(events);
    expect(result).toContain('evt-1');
    expect(result).toContain('evt-2');
    expect(result).toContain('message.sent');
  });
});

// --- formatStatus ---

describe('formatStatus', () => {
  it('shows status ok', () => {
    const result = formatStatus(makeStatus());
    expect(result).toContain('ok');
  });

  it('shows version', () => {
    const result = formatStatus(makeStatus({ version: '1.0.0' }));
    expect(result).toContain('1.0.0');
  });

  it('shows uptime in human-readable format', () => {
    // 3600 seconds = 1 hour
    const result = formatStatus(makeStatus({ uptime: 3600 }));
    expect(result).toContain('1h');
  });

  it('shows peer counts', () => {
    const result = formatStatus(makeStatus({ peers: { active: 3, stale: 1, total: 4 } }));
    expect(result).toContain('3');
    expect(result).toContain('active');
  });

  it('shows message stats', () => {
    const result = formatStatus(makeStatus({ messages: { total: 50, undelivered: 5 } }));
    expect(result).toContain('50');
    expect(result).toContain('5');
  });

  it('shows lock count', () => {
    const result = formatStatus(makeStatus({ locks: { active: 2 } }));
    expect(result).toContain('2');
  });

  it('shows event count', () => {
    const result = formatStatus(makeStatus({ events: { total: 120 } }));
    expect(result).toContain('120');
  });

  it('shows PID and port', () => {
    const result = formatStatus(makeStatus({ pid: 54321, port: 7899 }));
    expect(result).toContain('54321');
    expect(result).toContain('7899');
  });

  it('shows database size in human-readable format', () => {
    const result = formatStatus(makeStatus({ db: { sizeBytes: 1048576, walSizeBytes: 4096 } }));
    // 1MB
    expect(result).toContain('1.0 MB');
  });

  it('handles small database sizes', () => {
    const result = formatStatus(makeStatus({ db: { sizeBytes: 512, walSizeBytes: 100 } }));
    expect(result).toContain('512 B');
  });

  it('handles zero uptime', () => {
    const result = formatStatus(makeStatus({ uptime: 0 }));
    expect(result).toContain('0s');
  });
});
