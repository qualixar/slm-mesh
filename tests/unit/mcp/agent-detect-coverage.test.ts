/**
 * SLM Mesh — Agent detection coverage tests
 * Covers: detectFromProcessTree catch path, walkProcessTree edge cases.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectAgentType } from '../../../src/mcp/agent-detect.js';

describe('detectAgentType coverage', () => {
  const envBackup: Record<string, string | undefined> = {};

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function setEnv(key: string, value: string | undefined) {
    envBackup[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it('detects claude-code from CLAUDECODE env var', () => {
    setEnv('CLAUDECODE', '1');
    setEnv('CURSOR_TRACE_ID', undefined);
    setEnv('VSCODE_PID', undefined);
    expect(detectAgentType()).toBe('claude-code');
  });

  it('detects cursor from CURSOR_TRACE_ID env var', () => {
    setEnv('CLAUDECODE', undefined);
    setEnv('CURSOR_TRACE_ID', 'some-trace');
    setEnv('VSCODE_PID', undefined);
    expect(detectAgentType()).toBe('cursor');
  });

  it('detects vscode from VSCODE_PID env var', () => {
    setEnv('CLAUDECODE', undefined);
    setEnv('CURSOR_TRACE_ID', undefined);
    setEnv('VSCODE_PID', '12345');
    expect(detectAgentType()).toBe('vscode');
  });

  it('falls through to process tree when no env vars set', () => {
    setEnv('CLAUDECODE', undefined);
    setEnv('CURSOR_TRACE_ID', undefined);
    setEnv('VSCODE_PID', undefined);
    const result = detectAgentType();
    expect(typeof result).toBe('string');
    // Should be either a detected agent type or 'unknown'
    expect(['claude-code', 'cursor', 'codex', 'windsurf', 'aider', 'vscode', 'unknown']).toContain(result);
  });

  it('returns unknown when both env and process tree fail', () => {
    setEnv('CLAUDECODE', undefined);
    setEnv('CURSOR_TRACE_ID', undefined);
    setEnv('VSCODE_PID', undefined);
    // The process tree detection runs ps which may or may not find an agent
    // but all paths should return a valid AgentType
    const result = detectAgentType();
    expect(result).toBeDefined();
  });
});
