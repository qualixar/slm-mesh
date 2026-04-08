/**
 * SLM Mesh — Configuration
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export interface MeshConfig {
  readonly dataDir: string;
  readonly dbPath: string;
  readonly brokerPort: number;
  readonly brokerHost: string;
  readonly pidPath: string;
  readonly portPath: string;
  readonly tokenPath: string;
  readonly logPath: string;
  readonly peersDir: string;
  readonly heartbeatIntervalMs: number;
  readonly staleThresholdMs: number;
  readonly deadThresholdMs: number;
  readonly idleShutdownMs: number;
  readonly lockDefaultTtlMin: number;
  readonly maxPortRetries: number;
  readonly walCheckpointIntervalMs: number;
}

export const VERSION = '1.2.2';
export const PRODUCT_NAME = 'SLM Mesh';
export const BRANDING = `${PRODUCT_NAME} v${VERSION} | Part of the Qualixar research initiative`;

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * SEC-007: Only allow localhost binding. Prevents accidental exposure to the network.
 */
function validateBrokerHost(host: string): string {
  const ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const;
  if (!(ALLOWED_HOSTS as readonly string[]).includes(host)) {
    throw new Error(
      `Invalid SLM_MESH_HOST: "${host}". Only localhost binding is allowed (127.0.0.1, localhost, ::1).`,
    );
  }
  return host;
}

export function createConfig(overrides?: Partial<MeshConfig>): MeshConfig {
  const dataDir = overrides?.dataDir
    ?? envStr('SLM_MESH_DATA_DIR', join(homedir(), '.slm-mesh'));

  return {
    dataDir,
    dbPath: overrides?.dbPath ?? join(dataDir, 'mesh.db'),
    brokerPort: overrides?.brokerPort ?? envInt('SLM_MESH_PORT', 7899),
    brokerHost: overrides?.brokerHost ?? validateBrokerHost(envStr('SLM_MESH_HOST', '127.0.0.1')),
    pidPath: overrides?.pidPath ?? join(dataDir, 'broker.pid'),
    portPath: overrides?.portPath ?? join(dataDir, 'port'),
    tokenPath: overrides?.tokenPath ?? join(dataDir, 'broker.token'),
    logPath: overrides?.logPath ?? join(dataDir, 'broker.log'),
    peersDir: overrides?.peersDir ?? join(dataDir, 'peers'),
    heartbeatIntervalMs: overrides?.heartbeatIntervalMs ?? 15_000,
    staleThresholdMs: overrides?.staleThresholdMs ?? 30_000,
    deadThresholdMs: overrides?.deadThresholdMs ?? 60_000,
    idleShutdownMs: overrides?.idleShutdownMs ?? 60_000,
    lockDefaultTtlMin: overrides?.lockDefaultTtlMin ?? 10,
    maxPortRetries: overrides?.maxPortRetries ?? 10,
    walCheckpointIntervalMs: overrides?.walCheckpointIntervalMs ?? 30_000,
  };
}
