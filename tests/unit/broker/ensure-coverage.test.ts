/**
 * SLM Mesh — ensureBroker coverage tests
 * Tests the broker spawning path (lines 46-85).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { ensureBroker } from '../../../src/broker/ensure.js';
import { createConfig } from '../../../src/config.js';

describe('ensureBroker', () => {
  let tempDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any;

  afterEach(async () => {
    if (server) server.close();
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns port when broker is already alive', async () => {
    server = createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-ensure-cov-'));
    writeFileSync(join(tempDir, 'port'), String(port));

    const config = createConfig({
      dataDir: tempDir,
      portPath: join(tempDir, 'port'),
      brokerPort: port,
    });

    const result = await ensureBroker(config, '/dev/null');
    expect(result).toBe(port);
  });

  it('throws after timeout when broker fails to start', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-ensure-cov2-'));

    const config = createConfig({
      dataDir: tempDir,
      portPath: join(tempDir, 'port'),
      tokenPath: join(tempDir, 'broker.token'),
      logPath: join(tempDir, 'broker.log'),
      brokerPort: 19876,
    });

    // Pass a script that exits immediately (non-existent — will fail)
    // Reduce poll attempts by using a bad broker script
    await expect(
      ensureBroker(config, join(tempDir, 'nonexistent-broker.js')),
    ).rejects.toThrow(/Failed to start broker/);
  }, 15000);
});
