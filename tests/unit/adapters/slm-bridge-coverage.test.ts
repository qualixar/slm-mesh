/**
 * SLM Mesh — SlmMemoryBridge coverage tests
 * Covers: recall, onEvent, onStateChange, runSlm error path.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'node:child_process';

// We need to mock execFileSync BEFORE importing SlmMemoryBridge
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof cp>('node:child_process');
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

// Import after mock
const { SlmMemoryBridge } = await import('../../../src/adapters/slm-bridge.js');

describe('SlmMemoryBridge coverage', () => {
  let origStderrWrite: typeof process.stderr.write;
  let stderrOutput: string;

  beforeEach(() => {
    stderrOutput = '';
    origStderrWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      stderrOutput += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = origStderrWrite;
    vi.restoreAllMocks();
  });

  describe('when SLM is available', () => {
    beforeEach(() => {
      // Mock 'which slm' to succeed
      const mockExec = vi.mocked(cp.execFileSync);
      mockExec.mockImplementation((cmd: string, args?: readonly string[]) => {
        if (cmd === 'which' && args?.[0] === 'slm') return Buffer.from('/usr/bin/slm');
        if (cmd === 'which' && args?.[0] === 'superlocalmemory') return Buffer.from('');
        if (cmd === 'slm' && args?.[0] === 'remember') return Buffer.from('');
        if (cmd === 'slm' && args?.[0] === 'recall') return Buffer.from('result1\nresult2\n');
        return Buffer.from('');
      });
    });

    it('isAvailable returns true', () => {
      const bridge = new SlmMemoryBridge();
      expect(bridge.isAvailable()).toBe(true);
    });

    it('onMessage calls slm remember', async () => {
      const bridge = new SlmMemoryBridge();
      await bridge.onMessage({
        id: 'msg-1',
        fromPeer: 'peer-1',
        toPeer: 'peer-2',
        type: 'text',
        payload: 'hello world',
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
      });
      expect(cp.execFileSync).toHaveBeenCalledWith(
        'slm',
        ['remember', expect.stringContaining('peer-1')],
        expect.any(Object),
      );
    });

    it('onStateChange calls slm remember', async () => {
      const bridge = new SlmMemoryBridge();
      await bridge.onStateChange({
        key: 'mykey',
        value: 'myval',
        namespace: 'default',
        updatedBy: 'peer-1',
        updatedAt: new Date().toISOString(),
      });
      expect(cp.execFileSync).toHaveBeenCalledWith(
        'slm',
        ['remember', expect.stringContaining('mykey')],
        expect.any(Object),
      );
    });

    it('onEvent calls slm remember', async () => {
      const bridge = new SlmMemoryBridge();
      await bridge.onEvent({
        id: 'evt-1',
        type: 'peer_joined',
        payload: 'test payload',
        emittedBy: 'peer-1',
        createdAt: new Date().toISOString(),
      });
      expect(cp.execFileSync).toHaveBeenCalledWith(
        'slm',
        ['remember', expect.stringContaining('peer_joined')],
        expect.any(Object),
      );
    });

    it('recall returns parsed lines', async () => {
      const mockExec = vi.mocked(cp.execFileSync);
      mockExec.mockImplementation(((cmd: string, args?: readonly string[], opts?: { encoding?: string }) => {
        if (cmd === 'which' && args?.[0] === 'slm') return '/usr/bin/slm';
        if (cmd === 'which') throw new Error('not found');
        // When encoding is set, execFileSync returns string
        if (cmd === 'slm' && args?.[0] === 'recall') return 'result1\nresult2\n';
        return '';
      }) as typeof cp.execFileSync);
      const bridge = new SlmMemoryBridge();
      const results = await bridge.recall('test query');
      expect(results).toEqual(['result1', 'result2']);
    });

    it('recall returns empty array on error', async () => {
      const mockExec = vi.mocked(cp.execFileSync);
      mockExec.mockImplementation((cmd: string, args?: readonly string[]) => {
        if (cmd === 'which' && args?.[0] === 'slm') return Buffer.from('/usr/bin/slm');
        if (cmd === 'which') throw new Error('not found');
        if (cmd === 'slm' && args?.[0] === 'recall') {
          throw new Error('recall failed');
        }
        return Buffer.from('');
      });
      const bridge = new SlmMemoryBridge();
      const results = await bridge.recall('test');
      expect(results).toEqual([]);
    });

    it('runSlm handles execFileSync error gracefully', async () => {
      const mockExec = vi.mocked(cp.execFileSync);
      mockExec.mockImplementation((cmd: string, args?: readonly string[]) => {
        if (cmd === 'which') return Buffer.from('/usr/bin/slm');
        if (cmd === 'slm' && args?.[0] === 'remember') {
          throw new Error('remember failed');
        }
        return Buffer.from('');
      });
      const bridge = new SlmMemoryBridge();
      // Should not throw
      await bridge.onMessage({
        id: 'msg-2',
        fromPeer: 'peer-1',
        toPeer: 'peer-2',
        type: 'text',
        payload: 'test',
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
      });
    });
  });

  describe('when SLM is not available', () => {
    beforeEach(() => {
      const mockExec = vi.mocked(cp.execFileSync);
      mockExec.mockImplementation(() => {
        throw new Error('not found');
      });
    });

    it('isAvailable returns false', () => {
      const bridge = new SlmMemoryBridge();
      expect(bridge.isAvailable()).toBe(false);
      expect(stderrOutput).toContain('SLM not detected');
    });

    it('onMessage is a no-op', async () => {
      const bridge = new SlmMemoryBridge();
      await bridge.onMessage({
        id: 'x', fromPeer: 'a', toPeer: 'b', type: 'text',
        payload: 'hi', createdAt: '', deliveredAt: null, readAt: null,
      });
      // No crash
    });

    it('onStateChange is a no-op', async () => {
      const bridge = new SlmMemoryBridge();
      await bridge.onStateChange({
        key: 'k', value: 'v', namespace: 'ns', updatedBy: 'p', updatedAt: '',
      });
    });

    it('onEvent is a no-op', async () => {
      const bridge = new SlmMemoryBridge();
      await bridge.onEvent({
        id: 'e', type: 'x', payload: 'p', emittedBy: 'q', createdAt: '',
      });
    });

    it('recall returns empty array', async () => {
      const bridge = new SlmMemoryBridge();
      const results = await bridge.recall('anything');
      expect(results).toEqual([]);
    });
  });
});
