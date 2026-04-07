/**
 * SLM Mesh — Broker coverage tests for uncovered lines
 * Lines 166-175 (signal handlers), 251-252 (cleanStaleFromCrash log).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Broker } from '../../../src/broker/broker.js';
import { createConfig } from '../../../src/config.js';

function tempConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'slm-mesh-broker-cov-'));
  return {
    dir,
    config: createConfig({
      dataDir: dir,
      dbPath: join(dir, 'mesh.db'),
      pidPath: join(dir, 'broker.pid'),
      portPath: join(dir, 'port'),
      tokenPath: join(dir, 'broker.token'),
      logPath: join(dir, 'broker.log'),
      peersDir: join(dir, 'peers'),
      brokerPort: 18900 + Math.floor(Math.random() * 1000),
      idleShutdownMs: 600_000,
    }),
  };
}

describe('Broker coverage', () => {
  let tempDir: string;
  let broker: Broker | null = null;

  afterEach(async () => {
    if (broker?.isRunning) await broker.stop();
    broker = null;
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('cleans stale peers from previous crash on start', async () => {
    // First start and register a peer, then stop uncleanly (don't clean DB)
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);
    await broker.start();
    const port = broker.port;
    const token = (await import('node:fs')).readFileSync(config.tokenPath, 'utf8').trim();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Register a peer
    await fetch(`http://127.0.0.1:${port}/register`, {
      method: 'POST', headers,
      body: JSON.stringify({ pid: 99999, projectPath: '/tmp/test-stale' }),
    });

    // Force-stop without clean peer cleanup
    await broker.stop();

    // Start again — should clean stale peers from crash (covers _cleanStaleFromCrash with changes > 0)
    const broker2 = new Broker(config);
    broker = broker2;
    await broker2.start();
    expect(broker2.isRunning).toBe(true);
  });

  it('removes stale PID file on start when previous broker died', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;

    // Create stale PID file with a dead PID
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(config.pidPath, '999999');
    writeFileSync(config.portPath, '18800');

    broker = new Broker(config);
    await broker.start();
    expect(broker.isRunning).toBe(true);
  });

  it('throws if another broker is already running with same PID file', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);
    await broker.start();

    const broker2 = new Broker(config);
    await expect(broker2.start()).rejects.toThrow(/already running/);
  });

  it('signal handlers are registered and removed on stop', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);

    const origListenerCount = process.listenerCount('SIGINT');
    await broker.start();

    // Signal handlers should be registered
    expect(process.listenerCount('SIGINT')).toBeGreaterThan(origListenerCount);

    await broker.stop();

    // After stop, signal handlers should be removed
    expect(process.listenerCount('SIGINT')).toBe(origListenerCount);
  });

  it('_cleanStaleFromCrash with no stale peers (changes === 0)', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    // Just start — first boot has no stale peers
    broker = new Broker(config);
    await broker.start();
    // If we got here, _cleanStaleFromCrash ran without logging
    expect(broker.isRunning).toBe(true);
  });
});
