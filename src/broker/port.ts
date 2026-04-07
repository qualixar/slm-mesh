/**
 * SLM Mesh — Port discovery and conflict resolution
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import type { MeshConfig } from '../config.js';

const DEFAULT_PORT = 7899;

/**
 * Discover the broker port from (in priority order):
 * 1. SLM_MESH_PORT environment variable
 * 2. Port file on disk
 * 3. Default 7899
 */
export function discoverPort(config: MeshConfig): number {
  // Priority 1: environment variable
  const envVal = process.env['SLM_MESH_PORT'];
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  // Priority 2: port file
  const filePort = readPortFile(config.portPath);
  if (filePort !== null) {
    return filePort;
  }

  // Priority 3: default
  return DEFAULT_PORT;
}

/**
 * Write the broker port to a file.
 */
export function writePortFile(portPath: string, port: number): void {
  writeFileSync(portPath, String(port), { mode: 0o600 });
}

/**
 * Read port from a file. Returns null if missing or invalid.
 */
export function readPortFile(portPath: string): number | null {
  try {
    const content = readFileSync(portPath, 'utf8').trim();
    const port = parseInt(content, 10);
    return Number.isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

/**
 * Remove the port file. Does not throw if missing.
 */
export function removePortFile(portPath: string): void {
  try {
    unlinkSync(portPath);
  } catch {
    // Ignore ENOENT
  }
}

/**
 * Find an available port by attempting to bind starting from startPort.
 * Increments port on EADDRINUSE, up to maxRetries attempts.
 */
export async function findAvailablePort(
  startPort: number,
  host: string,
  maxRetries: number,
): Promise<number> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = startPort + attempt;
    const available = await tryBind(port, host);
    if (available) {
      return port;
    }
  }
  throw new Error(
    `No available port found in range ${startPort}-${startPort + maxRetries - 1}`,
  );
}

/**
 * Try to bind to a port. Returns true if available, false if in use.
 */
/**
 * Try to bind to a port. Returns true if available, false if in use or on error.
 * QA-011: Consolidated identical error branches into a single handler.
 */
function tryBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}
