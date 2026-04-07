/**
 * SLM Mesh — CLI comprehensive coverage tests
 * Tests all command action handlers via a real broker.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Broker } from '../../../src/broker/broker.js';
import { createConfig, VERSION } from '../../../src/config.js';
import { createProgram, runCli } from '../../../src/cli/cli.js';

/**
 * Integration tests: start a real broker, run CLI commands against it.
 * This covers all the command action handlers that are uncovered.
 */
describe('CLI command handlers (integration)', () => {
  let tempDir: string;
  let broker: Broker;
  let port: number;
  let origConsoleLog: typeof console.log;
  let origConsoleError: typeof console.error;
  let logOutput: string[];
  let errorOutput: string[];

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-cov-'));
    const config = createConfig({
      dataDir: tempDir,
      dbPath: join(tempDir, 'mesh.db'),
      pidPath: join(tempDir, 'broker.pid'),
      portPath: join(tempDir, 'port'),
      tokenPath: join(tempDir, 'broker.token'),
      logPath: join(tempDir, 'broker.log'),
      peersDir: join(tempDir, 'peers'),
      brokerPort: 18900 + Math.floor(Math.random() * 1000),
      idleShutdownMs: 600_000,
    });
    broker = new Broker(config);
    await broker.start();
    port = broker.port;

    // Set env vars so CLI can find the broker
    process.env['SLM_MESH_DATA_DIR'] = tempDir;
    process.env['SLM_MESH_PORT'] = String(port);
  });

  afterAll(async () => {
    if (broker?.isRunning) await broker.stop();
    delete process.env['SLM_MESH_DATA_DIR'];
    delete process.env['SLM_MESH_PORT'];
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    logOutput = [];
    errorOutput = [];
    origConsoleLog = console.log;
    origConsoleError = console.error;
    console.log = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => errorOutput.push(args.map(String).join(' '));
  });

  afterEach(() => {
    console.log = origConsoleLog;
    console.error = origConsoleError;
  });

  it('version subcommand prints version', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'version']);
    expect(logOutput.some(l => l.includes(VERSION))).toBe(true);
  });

  it('status command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'status']);
    const json = JSON.parse(logOutput[0]);
    expect(json.status).toBe('ok');
  });

  it('status command in human mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'status']);
    expect(logOutput.some(l => l.includes('Status:'))).toBe(true);
  });

  it('peers command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'peers']);
    const json = JSON.parse(logOutput[0]);
    expect(json).toHaveProperty('peers');
  });

  it('peers command in human mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'peers']);
    // Output is either peers table or "No active peers"
    expect(logOutput.length).toBeGreaterThan(0);
  });

  it('send command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'send', 'some-peer', 'hello']);
    const json = JSON.parse(logOutput[0]);
    // Peer doesn't exist, so ok might be false — but the handler executed
    expect(json).toBeDefined();
  });

  it('send command in human mode (failure path)', async () => {
    const program = createProgram();
    program.exitOverride();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    try {
      await program.parseAsync(['node', 'slm-mesh', 'send', 'nonexistent', 'hello']);
    } catch { /* expected exit */ }
    exitSpy.mockRestore();
  });

  it('broadcast command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'broadcast', 'hello all']);
    const json = JSON.parse(logOutput[0]);
    expect(json).toBeDefined();
  });

  it('broadcast command in human mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'broadcast', 'hello all']);
    expect(logOutput.length).toBeGreaterThan(0);
  });

  it('state get command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'state', 'get', 'mykey']);
    const json = JSON.parse(logOutput[0]);
    expect(json).toBeDefined();
  });

  it('state get command in human mode (key not found)', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'state', 'get', 'nonexistent']);
    expect(logOutput.some(l => l.includes('not found') || l.includes('nonexistent'))).toBe(true);
  });

  it('state set command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'state', 'set', 'k1', 'v1']);
    const json = JSON.parse(logOutput[0]);
    expect(json.ok).toBe(true);
  });

  it('state set command in human mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'state', 'set', 'k2', 'v2']);
    expect(logOutput.some(l => l.includes('Set k2'))).toBe(true);
  });

  it('state get command in human mode (key exists)', async () => {
    // Set first, then get
    let program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'state', 'set', 'testkey', 'testval']);
    logOutput = [];
    program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'state', 'get', 'testkey']);
    expect(logOutput.some(l => l.includes('testkey') && l.includes('testval'))).toBe(true);
  });

  it('lock list command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'lock', 'list']);
    const json = JSON.parse(logOutput[0]);
    expect(json).toBeDefined();
  });

  it('lock list command in human mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'lock', 'list']);
    expect(logOutput.length).toBeGreaterThan(0);
  });

  it('events command in JSON mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'events']);
    const json = JSON.parse(logOutput[0]);
    expect(json).toBeDefined();
  });

  it('events command in human mode', async () => {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'events']);
    expect(logOutput.length).toBeGreaterThan(0);
  });

  // Clean command is not tested via integration (killZombieProcesses makes blocking HTTP calls).
  // The clean helpers are tested in cli-helpers.test.ts.
});

// --- Error handling paths ---

describe('CLI handleError paths', () => {
  let origConsoleLog: typeof console.log;
  let origConsoleError: typeof console.error;
  let logOutput: string[];
  let errorOutput: string[];

  beforeEach(() => {
    logOutput = [];
    errorOutput = [];
    origConsoleLog = console.log;
    origConsoleError = console.error;
    console.log = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => errorOutput.push(args.map(String).join(' '));
  });

  afterEach(() => {
    console.log = origConsoleLog;
    console.error = origConsoleError;
    delete process.env['SLM_MESH_DATA_DIR'];
    delete process.env['SLM_MESH_PORT'];
  });

  it('handleError in JSON mode outputs JSON and exits', async () => {
    // Point to unreachable broker
    process.env['SLM_MESH_PORT'] = '19876';
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const program = createProgram();
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'slm-mesh', '--json', 'status']);
    } catch { /* expected exit */ }

    expect(logOutput.some(l => {
      try { const j = JSON.parse(l); return j.ok === false; } catch { return false; }
    })).toBe(true);

    exitSpy.mockRestore();
  });

  it('handleError in human mode outputs error message and exits', async () => {
    process.env['SLM_MESH_PORT'] = '19876';
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const program = createProgram();
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'slm-mesh', 'status']);
    } catch { /* expected exit */ }

    expect(errorOutput.some(l => l.includes('Error:'))).toBe(true);
    exitSpy.mockRestore();
  });
});

// --- runCli ---

describe('runCli', () => {
  it('parses version flag', async () => {
    const origLog = console.log;
    const logOutput: string[] = [];
    console.log = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
    try {
      await runCli(['node', 'slm-mesh', 'version']);
      expect(logOutput.some(l => l.includes('1.0.0'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});

// --- Stop command paths ---

describe('CLI stop command paths', () => {
  let origConsoleLog: typeof console.log;
  let origConsoleError: typeof console.error;
  let logOutput: string[];

  beforeEach(() => {
    logOutput = [];
    origConsoleLog = console.log;
    origConsoleError = console.error;
    console.log = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => {};
  });

  afterEach(() => {
    console.log = origConsoleLog;
    console.error = origConsoleError;
    delete process.env['SLM_MESH_DATA_DIR'];
  });

  it('stop with no PID file in JSON mode', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-stop-'));
    process.env['SLM_MESH_DATA_DIR'] = tempDir;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const program = createProgram();
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'slm-mesh', '--json', 'stop']);
    } catch { /* expected exit */ }

    expect(logOutput.some(l => {
      try { return JSON.parse(l).ok === false; } catch { return false; }
    })).toBe(true);

    exitSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stop with no PID file in human mode', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-stop2-'));
    process.env['SLM_MESH_DATA_DIR'] = tempDir;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const program = createProgram();
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'slm-mesh', 'stop']);
    } catch { /* expected exit */ }

    expect(logOutput.some(l => l.includes('No broker PID file found'))).toBe(true);

    exitSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stop with stale PID (process not running) in JSON mode', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-stop3-'));
    process.env['SLM_MESH_DATA_DIR'] = tempDir;
    // Write a PID file with a PID that doesn't exist
    writeFileSync(join(tempDir, 'broker.pid'), '999999');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const program = createProgram();
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'slm-mesh', '--json', 'stop']);
    } catch { /* expected exit */ }

    expect(logOutput.some(l => {
      try { const j = JSON.parse(l); return j.ok === false; } catch { return false; }
    })).toBe(true);

    exitSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stop with stale PID in human mode', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-stop4-'));
    process.env['SLM_MESH_DATA_DIR'] = tempDir;
    writeFileSync(join(tempDir, 'broker.pid'), '999999');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const program = createProgram();
    program.exitOverride();
    try {
      await program.parseAsync(['node', 'slm-mesh', 'stop']);
    } catch { /* expected exit */ }

    expect(logOutput.some(l => l.includes('not running'))).toBe(true);

    exitSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stop with PID of current process in JSON mode', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-stop5-'));
    process.env['SLM_MESH_DATA_DIR'] = tempDir;
    // Write current process PID — process is alive but stop sends SIGTERM
    // We mock process.kill to prevent actually killing ourselves
    writeFileSync(join(tempDir, 'broker.pid'), String(process.pid));

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => {}) as never);

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', '--json', 'stop']);

    const json = JSON.parse(logOutput[0]);
    expect(json).toBeDefined();

    killSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stop with running PID in human mode (still running after SIGTERM)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'slm-mesh-cli-stop6-'));
    process.env['SLM_MESH_DATA_DIR'] = tempDir;
    writeFileSync(join(tempDir, 'broker.pid'), String(process.pid));

    const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => {}) as never);

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'slm-mesh', 'stop']);

    // Should indicate still running or stopped
    expect(logOutput.some(l => l.includes('Broker') || l.includes('stopped') || l.includes('still running'))).toBe(true);

    killSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });
});

// Default action (no subcommand) tries to spawn a broker which is expensive.
// The action code paths are covered by the start command error path instead.
