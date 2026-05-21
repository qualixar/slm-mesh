/**
 * SLM Mesh — WebSocket Server Peer Routing Tests
 * Tests for peerId → clientId mapping and targeted delivery
 * Copyright 2026 Qualixar. MIT License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWsServer } from '../../../src/broker/push/ws-server.js';

describe('WsServer — peer routing interface', () => {
  let server: ReturnType<typeof createWsServer>;

  beforeEach(async () => {
    const validTokens = new Set(['test-token']);

    server = createWsServer(
      9999,
      '127.0.0.1',
      validTokens,
      () => {},
      () => {},
      () => {},
    );

    // Don't actually start the server in these unit tests
    // These tests focus on the interface and error handling
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('sendToPeer returns false for unknown peerId', async () => {
    const sent = server.sendToPeer('unknown-peer-id', { test: 'data' });
    expect(sent).toBe(false);
  });

  it('sendToPeer method exists on WsServer', () => {
    expect(typeof server.sendToPeer).toBe('function');
  });

  it('broadcast method exists on WsServer', () => {
    expect(typeof server.broadcast).toBe('function');
  });

  it('clientCount returns 0 when no clients connected', () => {
    expect(server.clientCount).toBe(0);
  });

  it('returns false when sending to peer with no active connection', () => {
    const result = server.sendToPeer('nonexistent-peer-id', {
      type: 'test',
      payload: 'data',
    });
    expect(result).toBe(false);
  });
});
