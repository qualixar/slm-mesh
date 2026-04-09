/**
 * SLM Mesh — BackendAdapter Interface
 * Defines the contract for ANY storage backend (SQLite, Redis, custom).
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import type {
  Peer,
  PeerId,
  PeerRegistration,
  PeerScope,
  Message,
  StateEntry,
  Lock,
  MeshEvent,
} from '../types.js';

export interface BackendAdapter {
  // --- Peers ---
  registerPeer(reg: PeerRegistration & { id: string; name: string }): Peer;
  removePeer(id: PeerId): void;
  listPeers(
    scope: PeerScope,
    projectPath?: string,
    gitRoot?: string,
    excludeId?: PeerId,
  ): Peer[];
  updateHeartbeat(id: PeerId): boolean;
  updateSummary(id: PeerId, summary: string): boolean;
  cleanStalePeers(staleThresholdSec: number): number;
  cleanDeadPeers(deadThresholdSec: number): string[];

  // --- Messages ---
  sendMessage(msg: {
    id: string;
    fromPeer: string;
    toPeer: string | null;
    type: string;
    payload: string;
  }): void;
  getMessages(
    peerId: PeerId,
    filter: string,
    from?: PeerId,
    limit?: number,
  ): Message[];
  markDelivered(messageId: string): void;
  markRead(messageIds: string[]): void;

  // --- State ---
  getState(namespace: string, key: string): StateEntry | null;
  setState(
    namespace: string,
    key: string,
    value: string,
    peerId: PeerId,
  ): StateEntry;
  listState(namespace: string): StateEntry[];
  deleteState(namespace: string, key: string): void;

  // --- Locks ---
  lockFile(
    filePath: string,
    peerId: PeerId,
    reason: string,
    ttlMinutes: number,
  ): Lock | { error: string };
  unlockFile(filePath: string, peerId: PeerId): boolean;
  queryLocks(filePath?: string): Lock[];
  releasePeerLocks(peerId: PeerId): void;

  // --- Events ---
  emitEvent(event: {
    id: string;
    type: string;
    payload: string;
    emittedBy: string;
  }): void;
  getEvents(
    types?: string[],
    since?: string,
    limit?: number,
  ): MeshEvent[];

  // --- Stats ---
  getStats(): {
    peers: { active: number; stale: number; total: number };
    messages: { total: number; undelivered: number };
    locks: { active: number };
    events: { total: number };
  };

  // --- Lifecycle ---
  close(): void;
}
