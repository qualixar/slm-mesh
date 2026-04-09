/**
 * SLM Mesh — PushManager: manages all peer UDS connections
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 *
 * Central registry of PeerConnections. Provides connect, disconnect,
 * send (unicast), and broadcast (multicast) operations.
 */

import { PeerConnection } from './connection.js';
import { log } from '../../util/logger.js';
import type { PushNotification } from '../../types.js';

export class PushManager {
  private readonly _connections: Map<string, PeerConnection> = new Map();

  /**
   * Create a new PeerConnection and connect to the peer's UDS socket.
   * If a connection already exists for this peerId, the old one is
   * disconnected first (replacement semantics).
   */
  connect(peerId: string, udsPath: string): void {
    // Disconnect existing connection if any
    const existing = this._connections.get(peerId);
    if (existing) {
      log(`PushManager: replacing connection for ${peerId}`);
      existing.disconnect();
    }

    const connection = new PeerConnection(peerId, udsPath);
    this._connections.set(peerId, connection);
    void connection.connect();
  }

  /**
   * Disconnect a specific peer and remove it from the registry.
   * No-op if the peer is not found.
   */
  disconnect(peerId: string): void {
    const connection = this._connections.get(peerId);
    if (!connection) {
      return;
    }
    connection.disconnect();
    this._connections.delete(peerId);
  }

  /**
   * Disconnect all peers and clear the registry.
   */
  disconnectAll(): void {
    for (const connection of this._connections.values()) {
      connection.disconnect();
    }
    this._connections.clear();
  }

  /**
   * Send a notification to a specific peer.
   * Returns false if the peer is not found or the send fails.
   */
  send(peerId: string, notification: PushNotification): boolean {
    const connection = this._connections.get(peerId);
    if (!connection) {
      return false;
    }
    return connection.send(notification);
  }

  /**
   * Broadcast a notification to all connected peers.
   */
  broadcast(notification: PushNotification): void {
    for (const connection of this._connections.values()) {
      connection.send(notification);
    }
  }

  /**
   * Get the list of peer IDs that have active connections.
   */
  getConnectedPeers(): string[] {
    return Array.from(this._connections.keys());
  }

  /** Number of peer connections in the registry */
  get peerCount(): number {
    return this._connections.size;
  }
}
