/**
 * SLM Mesh — NDJSON framing tests
 * TDD RED phase: tests written before implementation
 */

import { describe, it, expect, vi } from 'vitest';
import { serialize, createNdjsonParser } from '../../../src/broker/push/ndjson.js';

describe('serialize', () => {
  it('produces valid JSON terminated by newline', () => {
    const result = serialize({ type: 'message', payload: {} });
    expect(result.endsWith('\n')).toBe(true);
    expect(result.split('\n').length).toBe(2); // content + empty after trailing \n
    const parsed = JSON.parse(result.trim());
    expect(parsed).toEqual({ type: 'message', payload: {} });
  });

  it('handles nested objects', () => {
    const data = { a: { b: { c: [1, 2, 3] } }, d: 'hello' };
    const result = serialize(data);
    expect(result.endsWith('\n')).toBe(true);
    expect(JSON.parse(result.trim())).toEqual(data);
  });

  it('handles primitive values', () => {
    expect(serialize(42)).toBe('42\n');
    expect(serialize('hello')).toBe('"hello"\n');
    expect(serialize(null)).toBe('null\n');
    expect(serialize(true)).toBe('true\n');
  });

  it('handles empty object', () => {
    expect(serialize({})).toBe('{}\n');
  });

  it('produces single-line JSON (no pretty printing)', () => {
    const data = { a: 1, b: 2, c: { d: 3 } };
    const result = serialize(data);
    // Should be exactly one line of JSON + newline
    const lines = result.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toBeTruthy();
    expect(lines[1]).toBe('');
  });
});

describe('createNdjsonParser', () => {
  it('emits complete messages', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    parse(Buffer.from('{"type":"message"}\n'));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'message' });
  });

  it('handles partial chunks across multiple calls', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    // Split a single message across two chunks
    parse(Buffer.from('{"type":"mes'));
    expect(messages).toHaveLength(0);

    parse(Buffer.from('sage"}\n'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'message' });
  });

  it('handles multiple messages in one chunk', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    parse(Buffer.from('{"a":1}\n{"b":2}\n{"c":3}\n'));

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ a: 1 });
    expect(messages[1]).toEqual({ b: 2 });
    expect(messages[2]).toEqual({ c: 3 });
  });

  it('handles empty lines gracefully', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    parse(Buffer.from('{"a":1}\n\n\n{"b":2}\n'));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ a: 1 });
    expect(messages[1]).toEqual({ b: 2 });
  });

  it('handles invalid JSON gracefully by logging error and skipping', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    // Spy on stderr to verify error logging
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    parse(Buffer.from('not-json\n{"valid":true}\n'));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ valid: true });
    expect(stderrSpy).toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it('buffers incomplete trailing data until next chunk', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    // First chunk: complete message + start of second
    parse(Buffer.from('{"first":1}\n{"second":'));
    expect(messages).toHaveLength(1);

    // Second chunk: finish second message + complete third
    parse(Buffer.from('2}\n{"third":3}\n'));
    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ second: 2 });
    expect(messages[2]).toEqual({ third: 3 });
  });

  it('handles chunk that is just a newline', () => {
    const messages: unknown[] = [];
    const parse = createNdjsonParser((msg) => messages.push(msg));

    parse(Buffer.from('\n'));
    expect(messages).toHaveLength(0);
  });
});
