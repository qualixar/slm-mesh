/**
 * SLM Mesh — NDJSON coverage tests
 * Covers: buffer overflow protection path (lines 44-47).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect } from 'vitest';
import { createNdjsonParser } from '../../../src/broker/push/ndjson.js';

describe('createNdjsonParser coverage', () => {
  it('resets buffer when exceeding 1MB limit', () => {
    const messages: unknown[] = [];
    const parser = createNdjsonParser((data) => messages.push(data));

    // Send a chunk larger than 1MB without newlines (stays in buffer)
    const hugeChunk = Buffer.from('x'.repeat(1_100_000));
    parser(hugeChunk);

    // Buffer should have been reset, so sending valid JSON after should NOT
    // include leftover data. Send a newline to flush nothing, then valid data.
    parser(Buffer.from('{"ok":true}\n'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ ok: true });
  });
});
