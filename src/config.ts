/**
 * SLM Mesh — Configuration
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export interface MeshConfig {
  readonly dataDir: string;
  readonly dbPath: string;
  readonly brokerPort: number;
  readonly brokerHost: string;
  readonly wsPort: number;
  readonly sharedSecret: string | null;
  readonly isRemoteEnabled: boolean;
  readonly discoveryEnabled: boolean;
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

export const VERSION = '1.3.0';
export const PRODUCT_NAME = 'SLM Mesh';
export const BRANDING = `${PRODUCT_NAME} v${VERSION} | Part of the Qualixar research initiative`;

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1']);

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function isLocalhost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

export function createConfig(overrides?: Partial<MeshConfig>): MeshConfig {
  const dataDir = overrides?.dataDir
    ?? envStr('SLM_MESH_DATA_DIR', join(homedir(), '.slm-mesh'));

  const brokerHost = overrides?.brokerHost ?? envStr('SLM_MESH_HOST', '127.0.0.1');
  const remoteEnabled = !isLocalhost(brokerHost);
  const sharedSecret = envStr('SLM_MESH_SHARED_SECRET', '') || null;
  const discoveryEnabled = envStr('SLM_MESH_DISCOVERY', 'on') !== 'off';

  if (remoteEnabled && !sharedSecret) {
    throw new Error(
      'SLM_MESH_SHARED_SECRET is required when SLM_MESH_HOST is not localhost. '
      + 'Set it to a shared secret string on all machines in your mesh.',
    );
  }

  return {
    dataDir,
    dbPath: overrides?.dbPath ?? join(dataDir, 'mesh.db'),
    brokerPort: overrides?.brokerPort ?? envInt('SLM_MESH_PORT', 7899),
    brokerHost,
    wsPort: overrides?.wsPort ?? envInt('SLM_MESH_WS_PORT', (overrides?.brokerPort ?? envInt('SLM_MESH_PORT', 7899)) + 1),
    sharedSecret,
    isRemoteEnabled: remoteEnabled,
    discoveryEnabled: remoteEnabled && discoveryEnabled,
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
