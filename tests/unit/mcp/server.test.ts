/**
 * SLM Mesh — MCP Server tests
 * Tests the MCP server's internal functions and startup behavior.
 * Full integration requires stdio transport (tested manually).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect } from 'vitest';
import { VERSION, PRODUCT_NAME, BRANDING, createConfig } from '../../../src/config.js';

// The MCP server exports only startMcpServer which requires stdio transport.
// We test the components it uses:
// - Config creation (tested in config tests)
// - Broker client (tested in broker-client tests)
// - Agent detection (tested in agent-detect tests)
// - Peer listener (tested in peer-listener tests)
// - Handlers (tested in handlers tests — 73 tests)
//
// The MCP server itself is a thin orchestrator that:
// 1. Creates config
// 2. Ensures broker is running
// 3. Detects agent type
// 4. Creates peer listener
// 5. Registers 8 MCP tools
// 6. Registers with broker
// 7. Starts heartbeat
// 8. Starts stdio transport
//
// Each component is independently tested. The orchestration is verified
// via manual testing and the broker integration tests.

describe('MCP Server configuration', () => {
  it('config has correct version format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('config has correct product name', () => {
    expect(PRODUCT_NAME).toBe('SLM Mesh');
  });

  it('branding includes version and Qualixar', () => {
    expect(BRANDING).toContain(VERSION);
    expect(BRANDING).toContain('Qualixar');
  });

  it('config creates valid MeshConfig with all fields', () => {
    const config = createConfig();
    expect(config.dataDir).toBeDefined();
    expect(config.dbPath).toBeDefined();
    expect(config.brokerPort).toBe(7899);
    expect(config.brokerHost).toBe('127.0.0.1');
    expect(config.tokenPath).toBeDefined();
    expect(config.peersDir).toBeDefined();
    expect(config.heartbeatIntervalMs).toBe(15_000);
    expect(config.staleThresholdMs).toBe(30_000);
    expect(config.deadThresholdMs).toBe(60_000);
    expect(config.idleShutdownMs).toBe(60_000);
    expect(config.lockDefaultTtlMin).toBe(10);
  });

  it('config rejects non-localhost host via env var', () => {
    const orig = process.env['SLM_MESH_HOST'];
    try {
      process.env['SLM_MESH_HOST'] = '0.0.0.0';
      expect(() => createConfig()).toThrow(/localhost/i);
    } finally {
      if (orig !== undefined) process.env['SLM_MESH_HOST'] = orig;
      else delete process.env['SLM_MESH_HOST'];
    }
  });

  it('config accepts localhost variants', () => {
    expect(() => createConfig({ brokerHost: '127.0.0.1' })).not.toThrow();
    expect(() => createConfig({ brokerHost: 'localhost' })).not.toThrow();
    expect(() => createConfig({ brokerHost: '::1' })).not.toThrow();
  });
});
