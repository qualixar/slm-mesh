/**
 * SLM Mesh — CLI
 * Commander.js-based CLI for interacting with the broker via HTTP.
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 */

import { Command } from 'commander';
import { createConfig, VERSION, BRANDING } from '../config.js';
import { discoverPort } from '../broker/port.js';
import { readPidFile, isProcessAlive } from '../broker/pid.js';
import { readTokenFile } from '../broker/token.js';
import { formatPeers, formatLocks, formatEvents, formatStatus } from './format.js';
// Broker returns flat JSON responses like { ok: true, peers: [...] } — no data wrapper.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type BrokerResponse = Record<string, unknown> & { ok?: boolean; error?: string };

/** Paths exempt from bearer token authentication. */
const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health']);

/**
 * Build headers for a broker request, including bearer token when required.
 */
/** @internal Exported for testing */
export function buildAuthHeaders(path: string, isPost: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isPost) {
    headers['Content-Type'] = 'application/json';
  }
  if (!AUTH_EXEMPT_PATHS.has(path)) {
    const config = createConfig();
    const token = readTokenFile(config.tokenPath);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

// --- HTTP helpers ---

/** @internal Exported for testing */
export async function brokerGet(host: string, port: number, path: string): Promise<BrokerResponse> {
  const url = `http://${host}:${port}${path}`;
  const headers = buildAuthHeaders(path, false);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  return response.json() as Promise<BrokerResponse>;
}

/** @internal Exported for testing */
export async function brokerPost(
  host: string,
  port: number,
  path: string,
  body: Record<string, unknown>,
): Promise<BrokerResponse> {
  const url = `http://${host}:${port}${path}`;
  const headers = buildAuthHeaders(path, true);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return response.json() as Promise<BrokerResponse>;
}

/**
 * Print branding header (only in human mode).
 */
/** @internal Exported for testing */
export function printBranding(): void {
  console.log(BRANDING);
  console.log('');
}

/**
 * Handle errors uniformly. Print error and exit with code 1.
 */
/** @internal Exported for testing */
export function handleError(err: unknown, jsonMode: boolean): never {
  if (jsonMode) {
    console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  } else {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
}

/**
 * Resolve broker host and port from config.
 */
/** @internal Exported for testing */
export function resolveBroker(): { host: string; port: number } {
  const config = createConfig();
  const port = discoverPort(config);
  return { host: config.brokerHost, port };
}

/**
 * QA-012: Extracted zombie process cleanup from the clean command.
 */
/** @internal Exported for testing */
/* v8 ignore start -- requires real ps+HTTP calls to broker */
export async function killZombieProcesses(
  config: ReturnType<typeof createConfig>,
  jsonMode: boolean,
): Promise<number> {
  const { execFileSync } = await import('node:child_process');
  const psOutput = execFileSync('ps', ['aux'], { encoding: 'utf8' });
  const meshProcesses = psOutput.split('\n')
    .filter(line => line.includes('slm-mesh') && !line.includes('grep') && !line.includes('clean'));

  const brokerPid = readPidFile(config.pidPath);
  let killed = 0;

  for (const line of meshProcesses) {
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[1] ?? '', 10);
    if (Number.isNaN(pid) || pid === process.pid || pid === brokerPid) continue;

    try {
      const { host, port } = resolveBroker();
      const result = await brokerPost(host, port, '/peers', { scope: 'machine' });
      const peers = (result['peers'] as Array<{ pid: number }>) ?? [];
      if (!peers.some(p => p.pid === pid)) {
        process.kill(pid, 'SIGTERM');
        killed++;
        if (!jsonMode) console.log(`  Killed zombie PID ${pid}`);
      }
    } catch {
      try { process.kill(pid, 'SIGTERM'); killed++; } catch { /* already dead */ }
    }
  }

  return killed;
}
/* v8 ignore stop */

/**
 * QA-012: Extracted stale socket cleanup from the clean command.
 */
/** @internal Exported for testing */
export async function cleanStaleSockets(config: ReturnType<typeof createConfig>): Promise<number> {
  const { readdirSync, unlinkSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  let socksCleaned = 0;
  try {
    const files = readdirSync(config.peersDir);
    for (const f of files) {
      if (!f.endsWith('.sock')) continue;
      try {
        const full = join(config.peersDir, f);
        const stat = statSync(full);
        if (!stat.isSocket()) { unlinkSync(full); socksCleaned++; }
      } catch { /* skip */ }
    }
  } catch { /* no peers dir */ }
  return socksCleaned;
}

/**
 * Create and return the CLI program. Exported for testing.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('slm-mesh')
    .description('SLM Mesh — peer-to-peer communication for AI coding agents')
    .version(VERSION)
    .option('--json', 'Output raw JSON (no formatting, no branding)');

  // API-017: Default action — `npx slm-mesh` with no args starts broker + prints status
  /* v8 ignore start -- tested via manual CLI invocation */
  program.action(async () => {
    const jsonMode = program.opts()['json'] === true;
    try {
      if (!jsonMode) {
        printBranding();
        console.log('Starting broker...');
      }
      const config = createConfig();
      const { ensureBroker } = await import('../broker/ensure.js');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const mcpDir = dirname(fileURLToPath(import.meta.url));
      const brokerScript = join(mcpDir, '..', 'broker', 'broker-entry.js');
      const port = await ensureBroker(config, brokerScript);
      const { host } = resolveBroker();
      const result = await brokerGet(host, port, '/status');
      if (jsonMode) {
        console.log(JSON.stringify(result));
      } else {
        console.log(formatStatus(result as never));
      }
    } catch (err) {
      handleError(err, jsonMode);
    }
  });
  /* v8 ignore stop */

  // API-019: Explicit `version` subcommand (in addition to --version flag)
  program
    .command('version')
    .description('Print the SLM Mesh version')
    .action(() => {
      console.log(VERSION);
    });

  // --- start ---
  /* v8 ignore start -- tested via manual CLI invocation */
  program
    .command('start')
    .description('Start the broker (foreground)')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        if (!jsonMode) {
          printBranding();
          console.log('Starting broker...');
        }
        const config = createConfig();
        const { Broker } = await import('../broker/broker.js');
        const broker = new Broker(config);
        await broker.start();
        if (jsonMode) {
          console.log(JSON.stringify({ ok: true, data: { pid: process.pid, port: broker.port } }));
        }
        // Keep process alive — broker handles SIGINT/SIGTERM internally
      } catch (err) {
        handleError(err, jsonMode);
      }
  /* v8 ignore stop */
    });

  // --- stop (QA-026: flattened with early returns) ---
  program
    .command('stop')
    .description('Stop the running broker')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const config = createConfig();
        const pid = readPidFile(config.pidPath);

        if (pid === null) {
          const msg = 'No broker PID file found';
          if (jsonMode) { console.log(JSON.stringify({ ok: false, error: msg })); }
          else { printBranding(); console.log(`${msg}. Is the broker running?`); }
          process.exit(1);
        }

        if (!isProcessAlive(pid)) {
          const msg = `Broker process ${pid} is not running`;
          if (jsonMode) { console.log(JSON.stringify({ ok: false, error: msg })); }
          else { printBranding(); console.log(`${msg} (stale PID file).`); }
          process.exit(1);
        }

        process.kill(pid, 'SIGTERM');
        await new Promise<void>((r) => setTimeout(r, 500));
        const stopped = !isProcessAlive(pid);

        if (jsonMode) {
          console.log(JSON.stringify({ ok: stopped, data: { pid, stopped } }));
          /* v8 ignore next 5 */
        } else {
          printBranding();
          console.log(stopped
            ? `Broker (PID ${pid}) stopped.`
            : `Sent SIGTERM to broker (PID ${pid}), but process is still running.`);
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- status ---
  program
    .command('status')
    .description('Show broker health and stats')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerGet(host, port, '/status');
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          console.log(formatStatus(result as never));
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- peers ---
  program
    .command('peers')
    .description('List active sessions/peers')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/peers', { scope: 'machine' });
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          console.log(formatPeers((result['peers'] as never[] | undefined) ?? []));
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- send ---
  program
    .command('send <peerId> <message>')
    .description('Send a message to a specific peer')
    .option('--from <fromPeerId>', 'Sender peer ID (defaults to "cli")')
    .action(async (peerId: string, message: string, opts: { from?: string }) => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/send', {
          fromPeer: opts.from ?? 'cli',
          toPeer: peerId,
          type: 'text',
          payload: message,
        });
        if (jsonMode) {
          console.log(JSON.stringify(result));
          /* v8 ignore next 4 */
        } else {
          printBranding();
          if (result['ok']) {
            console.log(`Message sent to ${peerId}`);
          } else {
            /* v8 ignore next 3 */
            console.log(`Error: ${result['error'] ?? 'Failed to send'}`);
            process.exit(1);
          }
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- broadcast ---
  program
    .command('broadcast <message>')
    .description('Broadcast a message to all peers')
    .action(async (message: string) => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/send', {
          fromPeer: 'cli',
          toPeer: 'all',
          type: 'text',
          payload: message,
        });
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          if (result.ok) {
            console.log('Message broadcast to all peers');
          } else {
            /* v8 ignore next 3 */
            console.log(`Error: ${result.error ?? 'Failed to broadcast'}`);
            process.exit(1);
          }
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- state ---
  const stateCmd = program
    .command('state')
    .description('Shared state operations');

  stateCmd
    .command('get <key>')
    .description('Get a shared state value')
    .action(async (key: string) => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/state', { action: 'get', key });
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          const entry = result['entry'] as Record<string, unknown> | null;
          if (entry) {
            console.log(`${key} = ${entry['value'] as string}`);
          } else {
            console.log(`Key "${key}" not found`);
          }
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  stateCmd
    .command('set <key> <value>')
    .description('Set a shared state value')
    .option('--peer-id <peerId>', 'Peer ID setting this value (defaults to "cli")')
    .action(async (key: string, value: string, opts: { peerId?: string }) => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/state', {
          action: 'set',
          key,
          value,
          peerId: opts.peerId ?? 'cli',
        });
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          if (result.ok) {
            console.log(`Set ${key} = ${value}`);
          } else {
            /* v8 ignore next 3 */
            console.log(`Error: ${result.error ?? 'Failed to set'}`);
            process.exit(1);
          }
        }
      /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- lock ---
  const lockCmd = program
    .command('lock')
    .description('File lock operations');

  lockCmd
    .command('list')
    .description('List active file locks')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/lock', { action: 'query' });
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          console.log(formatLocks((result['locks'] as never[] | undefined) ?? []));
        }
        /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- events ---
  program
    .command('events')
    .description('Read recent mesh events')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const { host, port } = resolveBroker();
        const result = await brokerPost(host, port, '/events', { action: 'read' });
        if (jsonMode) {
          console.log(JSON.stringify(result));
        } else {
          printBranding();
          console.log(formatEvents((result['events'] as never[] | undefined) ?? []));
        }
        /* v8 ignore start */
      } catch (err) {
        handleError(err, jsonMode);
      }
      /* v8 ignore stop */
    });

  // --- clean (QA-012: extracted cleanup helpers) ---
  /* v8 ignore start -- clean command handler uses ps+HTTP which blocks in unit tests */
  program
    .command('clean')
    .description('Kill zombie MCP server processes and clean stale data')
    .action(async () => {
      const jsonMode = program.opts()['json'] === true;
      try {
        const config = createConfig();
        if (!jsonMode) {
          printBranding();
          console.log('Scanning for zombie processes...');
        }

        const killed = await killZombieProcesses(config, jsonMode);
        const socksCleaned = await cleanStaleSockets(config);

        if (jsonMode) {
          console.log(JSON.stringify({ ok: true, killed, socksCleaned }));
        } else {
          console.log(`\nDone: ${killed} zombie(s) killed, ${socksCleaned} stale socket(s) removed.`);
        }
      } catch (err) {
        handleError(err, jsonMode);
      }
    });
  /* v8 ignore stop */

  return program;
}

/**
 * Run the CLI. Called from index.ts when CLI mode is detected.
 */
export async function runCli(argv: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
