/**
 * SLM Mesh — CLI tests
 * Tests program creation, command registration, and argument parsing.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { createProgram, buildAuthHeaders, brokerGet, brokerPost } from '../../../src/cli/cli.js';

describe('createProgram', () => {
  it('creates a program with all expected commands', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('start');
    expect(names).toContain('stop');
    expect(names).toContain('status');
    expect(names).toContain('peers');
    expect(names).toContain('send');
    expect(names).toContain('broadcast');
    expect(names).toContain('state');
    expect(names).toContain('lock');
    expect(names).toContain('events');
    expect(names).toContain('clean');
    expect(names).toContain('version');
  });

  it('has --json global option', () => {
    const program = createProgram();
    const opts = program.options.map((o) => o.long);
    expect(opts).toContain('--json');
  });

  it('has correct version set', () => {
    const program = createProgram();
    expect(program.version()).toBeDefined();
    expect(program.version()).toContain('1.0.0');
  });

  it('has correct program name', () => {
    const program = createProgram();
    expect(program.name()).toBe('slm-mesh');
  });

  it('send command has required arguments', () => {
    const program = createProgram();
    const send = program.commands.find((c) => c.name() === 'send');
    expect(send).toBeDefined();
    // send <peerId> <message>
    const args = send!.registeredArguments;
    expect(args.length).toBe(2);
  });

  it('broadcast command has required argument', () => {
    const program = createProgram();
    const bc = program.commands.find((c) => c.name() === 'broadcast');
    expect(bc).toBeDefined();
    const args = bc!.registeredArguments;
    expect(args.length).toBe(1);
  });

  it('state command has subcommands', () => {
    const program = createProgram();
    const state = program.commands.find((c) => c.name() === 'state');
    expect(state).toBeDefined();
    const subs = state!.commands.map((c) => c.name());
    expect(subs).toContain('get');
    expect(subs).toContain('set');
  });

  it('lock command has subcommands', () => {
    const program = createProgram();
    const lock = program.commands.find((c) => c.name() === 'lock');
    expect(lock).toBeDefined();
    const subs = lock!.commands.map((c) => c.name());
    expect(subs).toContain('list');
  });
});

describe('buildAuthHeaders', () => {
  it('returns content-type for POST requests', () => {
    const headers = buildAuthHeaders('/register', true);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('does not include content-type for GET requests', () => {
    const headers = buildAuthHeaders('/health', false);
    expect(headers['Content-Type']).toBeUndefined();
  });
});

describe('brokerGet', () => {
  it('fetches JSON from broker GET endpoint', async () => {
    const server = createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    const port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );
    try {
      const result = await brokerGet('127.0.0.1', port, '/health');
      expect(result).toMatchObject({ status: 'ok' });
    } finally {
      server.close();
    }
  });

  it('throws on connection error', async () => {
    await expect(brokerGet('127.0.0.1', 19876, '/health')).rejects.toThrow();
  });
});

describe('brokerPost', () => {
  it('posts JSON to broker endpoint', async () => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, received: parsed }));
      });
    });
    const port = await new Promise<number>((r) =>
      server.listen(0, '127.0.0.1', () => r((server.address() as { port: number }).port)),
    );
    try {
      const result = await brokerPost('127.0.0.1', port, '/register', { pid: 123 }) as { ok: boolean; received: { pid: number } };
      expect(result.ok).toBe(true);
      expect(result.received.pid).toBe(123);
    } finally {
      server.close();
    }
  });
});
