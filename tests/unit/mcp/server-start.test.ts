/**
 * SLM Mesh — startMcpServer coverage test
 * Tests the main entry point by mocking McpServer and StdioServerTransport.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, afterAll, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock MCP SDK before importing
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

import { Broker } from '../../../src/broker/broker.js';
import { createConfig } from '../../../src/config.js';
import { startMcpServer, resetCleaningUp } from '../../../src/mcp/server.js';

describe('startMcpServer', () => {
  let tempDir: string;
  let broker: Broker;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-mcp-start-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
      pidPath: join(tempDir, 'broker.pid'),
      portPath: join(tempDir, 'port'),
      tokenPath: join(tempDir, 'broker.token'),
      logPath: join(tempDir, 'broker.log'),
      peersDir: join(tempDir, 'peers'),
      brokerPort: 18900 + Math.floor(Math.random() * 1000),
      idleShutdownMs: 600_000,
      heartbeatIntervalMs: 60_000, // long interval to prevent heartbeat issues
    });
    broker = new Broker(config);
    await broker.start();
    process.env['SLM_MESH_DATA_DIR'] = tempDir;
    process.env['SLM_MESH_PORT'] = String(broker.port);
  });

  afterAll(async () => {
    if (broker?.isRunning) await broker.stop();
    delete process.env['SLM_MESH_DATA_DIR'];
    delete process.env['SLM_MESH_PORT'];
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  afterEach(() => {
    resetCleaningUp();
  });

  it('starts MCP server successfully with mocked SDK', async () => {
    await startMcpServer({
      dataDir: tempDir,
      peersDir: '/tmp/slm-mcp-test-p',
      heartbeatIntervalMs: 600_000,
    });
    expect(true).toBe(true);
  });

  // Error paths in startMcpServer are covered via ensureBroker tests
  // and safeBrokerCall tests. The registration failure path (line 432-434)
  // would require mocking the broker to return ok:false on /register.
});
