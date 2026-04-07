// Copyright 2026 Varun Pratap Bhardwaj. MIT License.
/**
 * SLM Mesh — Bearer Token Management
 * Generates, writes, reads, and removes the broker authentication token.
 * Part of the Qualixar research initiative
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, unlinkSync, existsSync, chmodSync } from 'node:fs';
import { log, logError } from '../util/logger.js';

/** Token length in bytes (32 bytes = 64 hex chars). */
const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically random bearer token.
 * Returns a 64-character hex string.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Write the bearer token to disk with restrictive permissions (0o600).
 * The file is only readable/writable by the owning user.
 */
export function writeTokenFile(tokenPath: string, token: string): void {
  writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  // Double-ensure permissions (some platforms ignore mode in writeFileSync)
  chmodSync(tokenPath, 0o600);
  log('Bearer token written to disk');
}

/**
 * Read the bearer token from disk.
 * Returns the token string, or null if the file doesn't exist or is unreadable.
 */
export function readTokenFile(tokenPath: string): string | null {
  try {
    if (!existsSync(tokenPath)) return null;
    const content = readFileSync(tokenPath, 'utf8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/**
 * Read the bearer token from disk, throwing if unavailable.
 * Used by clients that require a valid token to operate.
 */
export function readTokenFileOrThrow(tokenPath: string): string {
  const token = readTokenFile(tokenPath);
  if (token === null) {
    throw new Error(
      `Cannot read broker token from ${tokenPath}. Is the broker running?`,
    );
  }
  return token;
}

/**
 * Remove the token file from disk. Safe to call if the file doesn't exist.
 */
export function removeTokenFile(tokenPath: string): void {
  try {
    if (existsSync(tokenPath)) {
      unlinkSync(tokenPath);
      log('Bearer token file removed');
    }
    /* v8 ignore next 3 */
  } catch (err) {
    logError('Failed to remove token file', err);
  }
}
