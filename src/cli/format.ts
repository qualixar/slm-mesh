/**
 * SLM Mesh — CLI output formatters
 * Simple table-like formatting for terminal output.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import type { Peer, Message, Lock, MeshEvent, BrokerStatus } from '../types.js';

const PAYLOAD_MAX_LEN = 80;

/**
 * Pad a string to a fixed width (right-padded).
 */
function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

/**
 * Truncate a string, appending "..." if it exceeds maxLen.
 */
function truncate(value: string, maxLen: number): string {
  return value.length <= maxLen ? value : value.slice(0, maxLen - 3) + '...';
}

/**
 * Format bytes into human-readable size.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format seconds into human-readable duration.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format a list of peers into a readable table.
 */
export function formatPeers(peers: readonly Peer[]): string {
  if (peers.length === 0) return 'No active peers';

  const header = [
    pad('ID', 16),
    pad('AGENT', 14),
    pad('STATUS', 8),
    pad('PID', 8),
    pad('BRANCH', 16),
    'PROJECT',
  ].join('  ');

  const separator = '-'.repeat(header.length);

  const rows = peers.map((p) => [
    pad(truncate(p.id, 16), 16),
    pad(p.agentType, 14),
    pad(p.status, 8),
    pad(String(p.pid), 8),
    pad(p.gitBranch ?? '-', 16),
    p.projectPath,
  ].join('  '));

  return [header, separator, ...rows].join('\n');
}

/**
 * Format a list of messages into a readable table.
 */
export function formatMessages(messages: readonly Message[]): string {
  if (messages.length === 0) return 'No messages';

  const header = [
    pad('', 1),
    pad('ID', 12),
    pad('FROM', 14),
    pad('TO', 14),
    pad('TYPE', 10),
    'PAYLOAD',
  ].join('  ');

  const separator = '-'.repeat(header.length);

  const rows = messages.map((m) => [
    m.readAt === null ? '*' : ' ',
    pad(truncate(m.id, 12), 12),
    pad(truncate(m.fromPeer, 14), 14),
    pad(m.toPeer !== null ? truncate(m.toPeer, 14) : 'all', 14),
    pad(m.type, 10),
    truncate(m.payload, PAYLOAD_MAX_LEN),
  ].join('  '));

  return [header, separator, ...rows].join('\n');
}

/**
 * Format a list of locks into a readable table.
 */
export function formatLocks(locks: readonly Lock[]): string {
  if (locks.length === 0) return 'No active locks';

  const header = [
    pad('FILE', 40),
    pad('LOCKED BY', 16),
    pad('REASON', 24),
    'EXPIRES',
  ].join('  ');

  const separator = '-'.repeat(header.length);

  const rows = locks.map((l) => [
    pad(truncate(l.filePath, 40), 40),
    pad(truncate(l.lockedBy, 16), 16),
    pad(truncate(l.reason, 24), 24),
    l.expiresAt,
  ].join('  '));

  return [header, separator, ...rows].join('\n');
}

/**
 * Format a list of events into a readable table.
 */
export function formatEvents(events: readonly MeshEvent[]): string {
  if (events.length === 0) return 'No events';

  const header = [
    pad('ID', 12),
    pad('TYPE', 20),
    pad('EMITTED BY', 16),
    'CREATED AT',
  ].join('  ');

  const separator = '-'.repeat(header.length);

  const rows = events.map((e) => [
    pad(truncate(e.id, 12), 12),
    pad(truncate(e.type, 20), 20),
    pad(truncate(e.emittedBy, 16), 16),
    e.createdAt,
  ].join('  '));

  return [header, separator, ...rows].join('\n');
}

/**
 * Format broker status into a readable report.
 */
export function formatStatus(status: BrokerStatus): string {
  const lines = [
    `Status:      ${status.status}`,
    `Version:     ${status.version}`,
    `Uptime:      ${formatUptime(status.uptime)}`,
    `PID:         ${status.pid}`,
    `Port:        ${status.port}`,
    '',
    'Peers:',
    `  active:    ${status.peers.active}`,
    `  stale:     ${status.peers.stale}`,
    `  total:     ${status.peers.total}`,
    '',
    'Messages:',
    `  total:     ${status.messages.total}`,
    `  undelivered: ${status.messages.undelivered}`,
    '',
    `Locks:       ${status.locks.active} active`,
    `Events:      ${status.events.total} total`,
    '',
    'Database:',
    `  size:      ${formatBytes(status.db.sizeBytes)}`,
    `  WAL:       ${formatBytes(status.db.walSizeBytes)}`,
  ];

  return lines.join('\n');
}
