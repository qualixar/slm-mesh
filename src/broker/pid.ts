/**
 * SLM Mesh — PID file management with race protection
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';

/**
 * Write a PID file using exclusive create (wx) to prevent races.
 * Throws if the file already exists.
 */
export function writePidFile(pidPath: string, pid: number): void {
  writeFileSync(pidPath, String(pid), { flag: 'wx', mode: 0o600 });
}

/**
 * Read and parse a PID file. Returns null if missing or invalid.
 */
export function readPidFile(pidPath: string): number | null {
  try {
    const content = readFileSync(pidPath, 'utf8').trim();
    const pid = parseInt(content, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Remove a PID file only if its content matches the expected PID.
 * Safety: prevents one broker from removing another's PID file.
 */
export function removePidFile(pidPath: string, expectedPid: number): boolean {
  const currentPid = readPidFile(pidPath);
  if (currentPid === null || currentPid !== expectedPid) {
    return false;
  }
  try {
    unlinkSync(pidPath);
    return true;
    /* v8 ignore next 3 */
  } catch {
    return false;
  }
}

/**
 * Check if a process is alive using kill signal 0.
 * Returns true if alive or EPERM (exists but different user).
 * Returns false if ESRCH (no such process).
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: process exists but we lack permission — treat as alive
    if ((err as NodeJS.ErrnoException).code === 'EPERM') {
      return true;
    }
    return false;
  }
}

/**
 * Check if a PID file is stale (the referenced process is dead).
 * Returns false if the file doesn't exist or the process is alive.
 */
export function isPidFileStale(pidPath: string): boolean {
  const pid = readPidFile(pidPath);
  if (pid === null) {
    return false;
  }
  return !isProcessAlive(pid);
}
