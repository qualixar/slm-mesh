/**
 * SLM Mesh — Path utilities
 * Handles UDS path validation (macOS 103 char limit), data dir creation
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * https://github.com/qualixar/slm-mesh
 */

import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** macOS sun_path limit is 103 bytes (not 108 like Linux) */
const MAX_SOCK_PATH_BYTES = 103;

export function validateSocketPath(sockPath: string): string {
  const byteLen = Buffer.byteLength(sockPath, 'utf8');
  if (byteLen <= MAX_SOCK_PATH_BYTES) {
    return sockPath;
  }
  // Fallback to /tmp for long paths
  const uid = process.getuid?.() ?? 0;
  const fallbackDir = join(tmpdir(), `slm-mesh-${uid}`, 'peers');
  ensureDir(fallbackDir);
  const filename = sockPath.split('/').pop() ?? 'fallback.sock';
  return join(fallbackDir, filename);
}

export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

/** SEC-017: UUID v4 regex for peer ID validation — prevents path traversal */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function peerSocketPath(peersDir: string, peerId: string): string {
  // SEC-017: Validate peerId is a UUID to prevent path traversal
  if (!UUID_V4_REGEX.test(peerId)) {
    throw new Error(`Invalid peer ID format: expected UUID, got "${peerId}"`);
  }
  const raw = join(peersDir, `${peerId}.sock`);
  return validateSocketPath(raw);
}
