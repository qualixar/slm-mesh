/**
 * SLM Mesh -- Agent Type Detection
 * 3-tier detection: env vars -> process tree -> default
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { execFileSync } from 'node:child_process';
import type { AgentType } from '../types.js';

// --- Types ---

interface ProcessInfo {
  readonly pid: number;
  readonly ppid: number;
  readonly comm: string;
  readonly args: string;
}

// --- Agent name patterns for process tree matching ---

const AGENT_PATTERNS: ReadonlyArray<{
  readonly test: (comm: string, args: string) => boolean;
  readonly type: AgentType;
}> = [
  {
    test: (comm, args) =>
      comm.includes('claude') || args.includes('anthropic.claude-code'),
    type: 'claude-code',
  },
  {
    test: (comm, args) =>
      comm.includes('cursor') || args.includes('cursor.app'),
    type: 'cursor',
  },
  {
    test: (comm, _args) =>
      comm === 'codex' || comm === 'codex-tui',
    type: 'codex',
  },
  {
    test: (_comm, args) =>
      args.includes('windsurf.app'),
    type: 'windsurf',
  },
  {
    test: (comm, args) =>
      comm === 'aider' || args.includes('aider'),
    type: 'aider',
  },
  {
    test: (comm, args) =>
      args.includes('visual studio code.app') || comm === 'code',
    type: 'vscode',
  },
];

// --- Tier 1: Environment variable detection (instant, no syscalls) ---

function detectFromEnv(): AgentType | null {
  // Claude Code sets CLAUDECODE=1 — most reliable signal
  if (process.env['CLAUDECODE'] === '1') {
    return 'claude-code';
  }

  // Cursor sets CURSOR_TRACE_ID in spawned processes
  if (process.env['CURSOR_TRACE_ID'] !== undefined) {
    return 'cursor';
  }

  // VS Code sets VSCODE_PID — but Claude Code also runs in VS Code,
  // so only match if CLAUDECODE was NOT set (checked above)
  if (process.env['VSCODE_PID'] !== undefined) {
    return 'vscode';
  }

  return null;
}

// --- Tier 2: Process tree walking ---

function getProcessInfo(pid: number): ProcessInfo | null {
  try {
    // PERF-014: Single ps call instead of 3 separate ones
    // SECURITY: execFileSync with args array — no shell injection
    const output = execFileSync('ps', ['-o', 'ppid=,comm=,args=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();

    if (!output) return null;

    // Parse "ppid comm args" — ppid is first token, comm is second, rest is args
    // Format: "  1234 node /usr/bin/node script.js"
    const match = output.match(/^\s*(\d+)\s+(\S+)\s+(.*)?$/);
    if (!match) return null;

    const ppid = parseInt(match[1]!, 10);
    if (Number.isNaN(ppid)) return null;

    const comm: string = match[2]!;
    const args = match[3]?.trim() ?? '';

    return { pid, ppid, comm, args };
    /* v8 ignore next 3 */
  } catch {
    return null;
  }
}

function walkProcessTree(startPid: number, maxDepth = 10): readonly ProcessInfo[] {
  const chain: ProcessInfo[] = [];
  let currentPid = startPid;

  for (let depth = 0; depth < maxDepth && currentPid > 1; depth++) {
    const info = getProcessInfo(currentPid);
    if (info === null) break;
    chain.push(info);
    currentPid = info.ppid;
  }

  return chain;
}

function detectFromProcessTree(): AgentType | null {
  try {
    const ancestors = walkProcessTree(process.ppid);
    for (const proc of ancestors) {
      const commLower = proc.comm.toLowerCase();
      const argsLower = proc.args.toLowerCase();

      for (const pattern of AGENT_PATTERNS) {
        if (pattern.test(commLower, argsLower)) {
          return pattern.type;
        }
      }
    }
    /* v8 ignore start */
  } catch {
    // Process tree walking failed — fall through
  }
  return null;
}
/* v8 ignore stop */

// --- Public API ---

/**
 * Detect which AI coding agent spawned this MCP server process.
 *
 * Uses a 3-tier approach:
 * 1. Environment variables (instant)
 * 2. Process tree walking (fallback)
 * 3. Default to 'unknown'
 */
export function detectAgentType(): AgentType {
  // Tier 1: Env vars — fast, no syscalls
  const fromEnv = detectFromEnv();
  if (fromEnv !== null) return fromEnv;

  // Tier 2: Process tree — slower, requires ps commands
  const fromTree = detectFromProcessTree();
  if (fromTree !== null) return fromTree;

  /* v8 ignore start */
  // Tier 3: Default
  return 'unknown';
}
/* v8 ignore stop */
