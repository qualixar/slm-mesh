/**
 * SLM Mesh — Ensure Broker Running
 * Used by MCP servers and CLI to auto-start the broker if needed.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { log } from '../util/logger.js';
import type { MeshConfig } from '../config.js';
import { readPortFile } from './port.js';
import { readTokenFile } from './token.js';
import { ensureDir } from '../util/paths.js';

const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_MAX_ATTEMPTS = 30; // 6 seconds total

/**
 * Check if the broker is alive by hitting GET /health.
 */
export async function isBrokerAlive(host: string, port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Discover the broker port and check if it's alive.
 */
export async function discoverAndCheckBroker(config: MeshConfig): Promise<{ alive: boolean; port: number }> {
  const port = readPortFile(config.portPath) ?? config.brokerPort;
  const alive = await isBrokerAlive(config.brokerHost, port);
  return { alive, port };
}

/**
 * Ensure the broker is running. If not, spawn it as a detached process.
 * Returns the port the broker is listening on.
 */
export async function ensureBroker(config: MeshConfig, brokerScript: string): Promise<number> {
  // Check if already running
  const { alive, port } = await discoverAndCheckBroker(config);
  if (alive) {
    log(`Broker already running on port ${port}`);
    return port;
  }

  // Spawn broker as detached process
  log('Starting broker daemon...');
  ensureDir(config.dataDir);

  const logFd = openSync(config.logPath, 'a');
  const child = spawn(process.execPath, [brokerScript], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      SLM_MESH_DATA_DIR: config.dataDir,
      SLM_MESH_PORT: String(config.brokerPort),
    },
  });
  child.unref();

  // Close log fd in parent process — child inherited it (SECURITY: prevents fd leak)
  closeSync(logFd);

  // Poll for health AND token file (token must exist before we return)
  for (let i = 0; i < HEALTH_POLL_MAX_ATTEMPTS; i++) {
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
    const brokerPort = readPortFile(config.portPath) ?? config.brokerPort;
    const tokenReady = readTokenFile(config.tokenPath) !== null;
    /* v8 ignore next 4 -- only reachable when broker daemon finishes starting */
    if (tokenReady && await isBrokerAlive(config.brokerHost, brokerPort)) {
      log(`Broker started on port ${brokerPort}`);
      return brokerPort;
    }
  }

  throw new Error('Failed to start broker after 6 seconds');
}
