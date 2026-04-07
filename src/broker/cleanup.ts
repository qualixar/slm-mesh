/**
 * SLM Mesh — Stale peer cleanup logic
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import { readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { logError } from '../util/logger.js';
import { generateId } from '../util/uuid.js';

/**
 * Mark active peers as 'stale' when their heartbeat exceeds the threshold.
 * Returns the count of peers marked stale.
 */
export function markStalePeers(
  db: Database.Database,
  staleThresholdMs: number,
): number {
  const seconds = String(Math.floor(staleThresholdMs / 1000));
  const result = db
    .prepare(
      `UPDATE peers
       SET status = 'stale'
       WHERE status = 'active'
         AND last_heartbeat < datetime('now', '-' || ? || ' seconds')`,
    )
    .run(seconds);
  return result.changes;
}

/**
 * Find stale peers past the dead threshold, delete their locks,
 * and mark them as 'dead'. Returns list of cleaned peer IDs.
 */
export function cleanDeadPeers(
  db: Database.Database,
  deadThresholdMs: number,
): string[] {
  const seconds = String(Math.floor(deadThresholdMs / 1000));

  const deadRows = db
    .prepare(
      `SELECT id FROM peers
       WHERE status = 'stale'
         AND last_heartbeat < datetime('now', '-' || ? || ' seconds')`,
    )
    .all(seconds) as Array<{ id: string }>;

  if (deadRows.length === 0) {
    return [];
  }

  const ids = deadRows.map((r) => r.id);

  const deleteLocks = db.prepare('DELETE FROM locks WHERE locked_by = ?');
  const deletePeer = db.prepare('DELETE FROM peers WHERE id = ?');
  const insertEvent = db.prepare(
    "INSERT INTO events (id, type, payload, emitted_by, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
  );

  const cleanupTxn = db.transaction((peerIds: string[]) => {
    for (const id of peerIds) {
      deleteLocks.run(id);
      // Emit peer_left event before deleting (API-012 fix)
      insertEvent.run(
        generateId(),
        'peer_left',
        JSON.stringify({ peerId: id, reason: 'dead_timeout' }),
        id,
      );
      deletePeer.run(id);
    }
  });

  cleanupTxn(ids);
  return ids;
}

/**
 * Sweep the peers directory for stale .sock files.
 * Uses statSync to check if a .sock file is a real Unix socket (S_IFSOCK).
 * Regular files with .sock extension are considered stale and deleted.
 * Returns the count of cleaned sockets.
 */
export function sweepStaleSockets(peersDir: string): number {
  let entries: string[];
  try {
    entries = readdirSync(peersDir);
  } catch (err) {
    logError('Failed to read peers directory for socket sweep', err);
    return 0;
  }

  const sockFiles = entries.filter((f) => f.endsWith('.sock'));
  let cleaned = 0;

  for (const file of sockFiles) {
    const fullPath = join(peersDir, file);
    if (!isLiveSocket(fullPath)) {
      try {
        unlinkSync(fullPath);
        cleaned++;
      } catch (err) {
        logError(`Failed to remove stale socket: ${fullPath}`, err);
      }
    }
  }

  return cleaned;
}

/**
 * Check if a .sock file is a live Unix domain socket.
 * A real UDS listener shows as S_IFSOCK in stat. A leftover file
 * (e.g., from a crashed process) will be a regular file or missing.
 */
function isLiveSocket(sockPath: string): boolean {
  try {
    const stat = statSync(sockPath);
    return stat.isSocket();
    /* v8 ignore next 3 */
  } catch {
    return false;
  }
}
