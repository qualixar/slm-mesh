/**
 * SLM Mesh — SlmMemoryBridge tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlmMemoryBridge } from '../../../src/adapters/slm-bridge.js';
import type { Message, MeshEvent, StateEntry } from '../../../src/types.js';

// Mock child_process to control SLM detection
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('not found');
  }),
}));

describe('SlmMemoryBridge', () => {
  let bridge: SlmMemoryBridge;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('returns false when SLM is not installed', () => {
      bridge = new SlmMemoryBridge();
      expect(bridge.isAvailable()).toBe(false);
    });
  });

  describe('no-ops when SLM is not available', () => {
    beforeEach(() => {
      bridge = new SlmMemoryBridge();
    });

    it('onMessage is a no-op', async () => {
      const msg: Message = {
        id: 'msg-1',
        fromPeer: 'p1',
        toPeer: 'p2',
        type: 'text',
        payload: 'hello',
        createdAt: new Date().toISOString(),
        readAt: null,
        delivered: false,
      };

      // Should not throw
      await expect(bridge.onMessage(msg)).resolves.toBeUndefined();
    });

    it('onStateChange is a no-op', async () => {
      const entry: StateEntry = {
        key: 'color',
        namespace: 'default',
        value: 'blue',
        updatedBy: 'p1',
        updatedAt: new Date().toISOString(),
      };

      await expect(bridge.onStateChange(entry)).resolves.toBeUndefined();
    });

    it('onEvent is a no-op', async () => {
      const event: MeshEvent = {
        id: 'evt-1',
        type: 'peer_joined',
        payload: '{}',
        emittedBy: 'p1',
        createdAt: new Date().toISOString(),
      };

      await expect(bridge.onEvent(event)).resolves.toBeUndefined();
    });

    it('recall returns empty array', async () => {
      const result = await bridge.recall('test query');
      expect(result).toEqual([]);
    });
  });
});
