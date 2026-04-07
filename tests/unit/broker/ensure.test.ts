/**
 * SLM Mesh — Ensure broker tests
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { isBrokerAlive, discoverAndCheckBroker } from '../../../src/broker/ensure.js';
import { createConfig } from '../../../src/config.js';

describe('isBrokerAlive', () => {
  it('returns true when broker responds to /health', async () => {
    const server = createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    try {
      expect(await isBrokerAlive('127.0.0.1', port)).toBe(true);
    } finally {
      server.close();
    }
  });

  it('returns false when nothing is listening', async () => {
    expect(await isBrokerAlive('127.0.0.1', 19999)).toBe(false);
  });

  it('returns false when server returns non-ok', async () => {
    const server = createServer((_, res) => {
      res.writeHead(500);
      res.end();
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    try {
      expect(await isBrokerAlive('127.0.0.1', port)).toBe(false);
    } finally {
      server.close();
    }
  });
});

describe('discoverAndCheckBroker', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-ensure-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns alive=false when no port file and broker not running', async () => {
    const config = createConfig({
      dataDir: tempDir,
      portPath: join(tempDir, 'port'),
      brokerPort: 19998,
    });
    const result = await discoverAndCheckBroker(config);
    expect(result.alive).toBe(false);
  });

  it('reads port from port file and checks liveness', async () => {
    writeFileSync(join(tempDir, 'port'), '19997');
    const config = createConfig({
      dataDir: tempDir,
      portPath: join(tempDir, 'port'),
    });
    const result = await discoverAndCheckBroker(config);
    expect(result.port).toBe(19997);
    expect(result.alive).toBe(false); // nothing listening
  });

  it('returns alive=true when broker is running', async () => {
    const server = createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });
    writeFileSync(join(tempDir, 'port'), String(port));

    try {
      const config = createConfig({
        dataDir: tempDir,
        portPath: join(tempDir, 'port'),
      });
      const result = await discoverAndCheckBroker(config);
      expect(result.alive).toBe(true);
      expect(result.port).toBe(port);
    } finally {
      server.close();
    }
  });
});
