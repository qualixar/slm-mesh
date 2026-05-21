/**
 * SLM Mesh — Peer Listener WebSocket Tests
 * Tests for WsPushClient behavior: proper construction and method signatures
 * Copyright 2026 Qualixar. MIT License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPeerListener, type PeerListener } from '../../../src/mcp/peer-listener.js';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import type { MeshConfig } from '../../../src/config.js';
import { generateId } from '../../../src/util/uuid.js';

describe('WsPushClient — interface', () => {
  let listener: PeerListener | null = null;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(`${tmpdir()}/slm-ws-test-`);
  });

  afterEach(async () => {
    if (listener) {
      await listener.stop();
      listener = null;
    }
  });

  it('creates peer listener with remote config', async () => {
    const peerId = generateId();

    const config: MeshConfig = {
      isRemoteEnabled: true,
      brokerHost: '127.0.0.1',
      brokerPort: 7899,
      wsPort: 7900,
      sharedSecret: 'test-secret',
      peersDir: tempDir,
      dataDir: tempDir,
      discoveryEnabled: false,
      idleShutdownMs: 0,
      heartbeatIntervalMs: 5000,
      staleThresholdMs: 30000,
      deadThresholdMs: 60000,
      walCheckpointIntervalMs: 5000,
      pidPath: `${tempDir}/test.pid`,
      portPath: `${tempDir}/test.port`,
      tokenPath: `${tempDir}/test.token`,
      dbPath: `${tempDir}/test.db`,
      maxPortRetries: 10,
    };

    listener = createPeerListener(peerId, config, () => {});

    // Verify listener was created
    expect(listener).toBeDefined();
    expect(typeof listener.start).toBe('function');
    expect(typeof listener.stop).toBe('function');
  });

  it('creates peer listener with local config (UDS)', async () => {
    const peerId = generateId();

    const config: MeshConfig = {
      isRemoteEnabled: false,
      brokerHost: '127.0.0.1',
      brokerPort: 7899,
      wsPort: 7900,
      sharedSecret: '',
      peersDir: tempDir,
      dataDir: tempDir,
      discoveryEnabled: false,
      idleShutdownMs: 0,
      heartbeatIntervalMs: 5000,
      staleThresholdMs: 30000,
      deadThresholdMs: 60000,
      walCheckpointIntervalMs: 5000,
      pidPath: `${tempDir}/test.pid`,
      portPath: `${tempDir}/test.port`,
      tokenPath: `${tempDir}/test.token`,
      dbPath: `${tempDir}/test.db`,
      maxPortRetries: 10,
    };

    listener = createPeerListener(peerId, config, () => {});

    // Verify listener was created
    expect(listener).toBeDefined();
    expect(listener.socketPath).toContain(peerId);
  });

  it('peer listener accepts notification handler', async () => {
    const peerId = generateId();
    const notifications: unknown[] = [];

    const config: MeshConfig = {
      isRemoteEnabled: false,
      brokerHost: '127.0.0.1',
      brokerPort: 7899,
      wsPort: 7900,
      sharedSecret: '',
      peersDir: tempDir,
      dataDir: tempDir,
      discoveryEnabled: false,
      idleShutdownMs: 0,
      heartbeatIntervalMs: 5000,
      staleThresholdMs: 30000,
      deadThresholdMs: 60000,
      walCheckpointIntervalMs: 5000,
      pidPath: `${tempDir}/test.pid`,
      portPath: `${tempDir}/test.port`,
      tokenPath: `${tempDir}/test.token`,
      dbPath: `${tempDir}/test.db`,
      maxPortRetries: 10,
    };

    listener = createPeerListener(peerId, config, (notif) => {
      notifications.push(notif);
    });

    // Verify listener was created with handler
    expect(listener).toBeDefined();
  });

  it('peer listener constructor validates peerId as UUID', async () => {
    const peerId = generateId();

    const config: MeshConfig = {
      isRemoteEnabled: false,
      brokerHost: '127.0.0.1',
      brokerPort: 7899,
      wsPort: 7900,
      sharedSecret: '',
      peersDir: tempDir,
      dataDir: tempDir,
      discoveryEnabled: false,
      idleShutdownMs: 0,
      heartbeatIntervalMs: 5000,
      staleThresholdMs: 30000,
      deadThresholdMs: 60000,
      walCheckpointIntervalMs: 5000,
      pidPath: `${tempDir}/test.pid`,
      portPath: `${tempDir}/test.port`,
      tokenPath: `${tempDir}/test.token`,
      dbPath: `${tempDir}/test.db`,
      maxPortRetries: 10,
    };

    // generateId() produces valid UUIDs
    expect(() => {
      listener = createPeerListener(peerId, config, () => {});
    }).not.toThrow();
  });

  it('peer listener rejects invalid peerId format', async () => {
    const invalidPeerId = 'not-a-uuid';

    const config: MeshConfig = {
      isRemoteEnabled: false,
      brokerHost: '127.0.0.1',
      brokerPort: 7899,
      wsPort: 7900,
      sharedSecret: '',
      peersDir: tempDir,
      dataDir: tempDir,
      discoveryEnabled: false,
      idleShutdownMs: 0,
      heartbeatIntervalMs: 5000,
      staleThresholdMs: 30000,
      deadThresholdMs: 60000,
      walCheckpointIntervalMs: 5000,
      pidPath: `${tempDir}/test.pid`,
      portPath: `${tempDir}/test.port`,
      tokenPath: `${tempDir}/test.token`,
      dbPath: `${tempDir}/test.db`,
      maxPortRetries: 10,
    };

    // Should throw on invalid UUID
    expect(() => {
      listener = createPeerListener(invalidPeerId, config, () => {});
    }).toThrow('Invalid peer ID format');
  });
});
