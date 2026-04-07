/**
 * SLM Mesh — Broker lifecycle tests
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Broker } from '../../../src/broker/broker.js';
import { createConfig } from '../../../src/config.js';

function tempConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'slm-mesh-broker-test-'));
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
      idleShutdownMs: 600_000, // don't auto-shutdown during test
    }),
  };
}

describe('Broker', () => {
  let tempDir: string;
  let broker: Broker | null = null;

  afterEach(async () => {
    if (broker?.isRunning) await broker.stop();
    broker = null;
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  // NOTE: Full lifecycle tests need network binding which is unavailable
  // after the memory blast. These tests work on a clean system.
  // Skipping network-dependent tests for now.
  it('starts and stops cleanly', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);
    await broker.start();
    expect(broker.isRunning).toBe(true);
    expect(broker.port).toBeGreaterThan(0);
    expect(existsSync(config.pidPath)).toBe(true);
    expect(existsSync(config.portPath)).toBe(true);
    expect(existsSync(config.tokenPath)).toBe(true);
    await broker.stop();
    expect(broker.isRunning).toBe(false);
  });

  it('creates data directory and peers directory', async () => {
    const dir = join(tmpdir(), `slm-mesh-newdir-${Date.now()}`);
    tempDir = dir;
    const config = createConfig({
      dataDir: dir,
      dbPath: join(dir, 'mesh.db'),
      pidPath: join(dir, 'broker.pid'),
      portPath: join(dir, 'port'),
      tokenPath: join(dir, 'broker.token'),
      logPath: join(dir, 'broker.log'),
      peersDir: join(dir, 'peers'),
      brokerPort: 18900 + Math.floor(Math.random() * 1000),
      idleShutdownMs: 600_000,
    });
    broker = new Broker(config);
    await broker.start();
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, 'peers'))).toBe(true);
    await broker.stop();
  });

  it('full HTTP integration: health + auth + register + peers', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);
    await broker.start();
    const port = broker.port;
    const token = readFileSync(config.tokenPath, 'utf8').trim();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Health (no auth needed)
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect((await healthRes.json() as { status: string }).status).toBe('ok');

    // Status without auth → 401
    expect((await fetch(`http://127.0.0.1:${port}/status`)).status).toBe(401);

    // Status with auth → ok
    const statusRes = await fetch(`http://127.0.0.1:${port}/status`, { headers });
    expect((await statusRes.json() as { status: string }).status).toBe('ok');

    // Register
    const regRes = await fetch(`http://127.0.0.1:${port}/register`, {
      method: 'POST', headers,
      body: JSON.stringify({ pid: process.pid, projectPath: '/tmp/test' }),
    });
    const reg = await regRes.json() as { ok: boolean; peerId: string };
    expect(reg.ok).toBe(true);

    // List peers
    const peersRes = await fetch(`http://127.0.0.1:${port}/peers`, {
      method: 'POST', headers,
      body: JSON.stringify({ scope: 'machine' }),
    });
    const peers = await peersRes.json() as { peers: Array<{ id: string }> };
    expect(peers.peers.some(p => p.id === reg.peerId)).toBe(true);

    await broker.stop();
  });

  it('stop is idempotent', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);
    await broker.start();
    await broker.stop();
    await broker.stop(); // should not throw
  });

  it('cleans up PID and port files on stop', async () => {
    const { dir, config } = tempConfig();
    tempDir = dir;
    broker = new Broker(config);
    await broker.start();
    expect(existsSync(config.pidPath)).toBe(true);
    await broker.stop();
    expect(existsSync(config.pidPath)).toBe(false);
    expect(existsSync(config.portPath)).toBe(false);
  });
});
