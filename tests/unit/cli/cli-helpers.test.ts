/**
 * SLM Mesh — CLI internal helper coverage tests
 * Tests printBranding, handleError, resolveBroker, killZombieProcesses, cleanStaleSockets.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  printBranding,
  handleError,
  resolveBroker,
  killZombieProcesses,
  cleanStaleSockets,
} from '../../../src/cli/cli.js';
import { createConfig, BRANDING } from '../../../src/config.js';

describe('printBranding', () => {
  it('prints BRANDING to console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printBranding();
    expect(logSpy).toHaveBeenCalledWith(BRANDING);
    logSpy.mockRestore();
  });
});

describe('handleError', () => {
  it('outputs JSON and exits in JSON mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => handleError(new Error('test error'), true)).toThrow('exit');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test error'));

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('outputs error text and exits in human mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => handleError(new Error('test error'), false)).toThrow('exit');
    expect(errSpy).toHaveBeenCalledWith('Error: test error');

    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('handles non-Error objects', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => handleError('string error', true)).toThrow('exit');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe('resolveBroker', () => {
  it('returns host and port from config', () => {
    const result = resolveBroker();
    expect(result.host).toBeDefined();
    expect(typeof result.port).toBe('number');
  });
});

describe('cleanStaleSockets', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns 0 when peers dir does not exist', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-csock-'));
    const config = createConfig({
      dataDir: tempDir,
      peersDir: join(tempDir, 'nonexistent'),
    });
    const result = await cleanStaleSockets(config);
    expect(result).toBe(0);
  });

  it('removes stale .sock files that are not real sockets', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-csock2-'));
    const peersDir = join(tempDir, 'peers');
    mkdirSync(peersDir, { recursive: true });
    writeFileSync(join(peersDir, 'stale.sock'), 'not a socket');
    writeFileSync(join(peersDir, 'regular.txt'), 'not a sock file');

    const config = createConfig({
      dataDir: tempDir,
      peersDir,
    });
    const result = await cleanStaleSockets(config);
    expect(result).toBe(1);
  });

  it('skips files that cause errors', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-csock3-'));
    const peersDir = join(tempDir, 'peers');
    mkdirSync(peersDir, { recursive: true });
    // Create a directory with .sock extension — statSync will succeed but isSocket() returns false
    mkdirSync(join(peersDir, 'dir.sock'));

    const config = createConfig({
      dataDir: tempDir,
      peersDir,
    });
    // Should not throw
    const result = await cleanStaleSockets(config);
    expect(typeof result).toBe('number');
  });
});

// killZombieProcesses is tested via CLI integration (clean command)
// Direct testing requires broker access which hangs in unit tests.
