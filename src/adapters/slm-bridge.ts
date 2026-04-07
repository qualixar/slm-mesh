/**
 * SLM Mesh — SLM Memory Bridge
 * Integrates with SuperLocalMemory for persistent context.
 * Gracefully degrades to no-ops when SLM is not installed.
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import { execFileSync } from 'node:child_process';
import type { MemoryBridge } from './memory-bridge.js';
import type { Message, StateEntry, MeshEvent } from '../types.js';
import { logError } from '../util/logger.js';

/** Check if a CLI command exists in PATH. SECURITY: uses execFileSync, not execSync. */
function commandExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Detect which SLM CLI command is available, if any. */
function detectSlmCommand(): string | null {
  if (commandExists('slm')) return 'slm';
  if (commandExists('superlocalmemory')) return 'superlocalmemory';
  return null;
}

export class SlmMemoryBridge implements MemoryBridge {
  private readonly slmCmd: string | null;
  private readonly available: boolean;

  constructor() {
    this.slmCmd = detectSlmCommand();
    this.available = this.slmCmd !== null;

    if (!this.available) {
      // Log once — no repeated warnings
      process.stderr.write('[slm-mesh] SLM not detected, memory bridge disabled\n');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async onMessage(msg: Message): Promise<void> {
    if (!this.available) return;
    this.runSlm(
      `[mesh:message] ${msg.fromPeer} -> ${msg.toPeer ?? 'broadcast'}: ${msg.payload.slice(0, 200)}`,
    );
  }

  async onStateChange(entry: StateEntry): Promise<void> {
    if (!this.available) return;
    this.runSlm(
      `[mesh:state] ${entry.namespace}/${entry.key} = ${entry.value.slice(0, 200)} (by ${entry.updatedBy})`,
    );
  }

  async onEvent(event: MeshEvent): Promise<void> {
    if (!this.available) return;
    this.runSlm(
      `[mesh:event] ${event.type} by ${event.emittedBy}: ${event.payload.slice(0, 200)}`,
    );
  }

  async recall(query: string): Promise<string[]> {
    if (!this.available || !this.slmCmd) return [];
    try {
      // SECURITY: execFileSync with args array — no shell injection possible
      const output = execFileSync(this.slmCmd, ['recall', query], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return output.split('\n').filter((line) => line.trim().length > 0);
    } catch {
      return [];
    }
  }

  /** Execute `slm remember` with the given content. SECURITY: uses execFileSync. */
  private runSlm(content: string): void {
    if (!this.slmCmd) return;
    try {
      // SECURITY: execFileSync with args array — no shell injection possible
      execFileSync(this.slmCmd, ['remember', content], {
        stdio: 'ignore',
        timeout: 5000,
      });
    } catch (err) {
      logError('SLM bridge remember failed', err);
    }
  }
}
