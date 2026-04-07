/**
 * SLM Mesh — NDJSON (Newline-Delimited JSON) framing for UDS communication
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 *
 * NDJSON is a simple framing protocol: each JSON object is separated by '\n'.
 * This enables streaming over UDS without length-prefix framing.
 */

import { logError } from '../../util/logger.js';

/** SEC-009: Maximum NDJSON buffer size (1MB) to prevent memory exhaustion */
const MAX_BUFFER_BYTES = 1_048_576;

/**
 * Serialize data to a single NDJSON line: JSON.stringify(data) + '\n'
 * Produces compact (single-line) JSON — no pretty printing.
 */
export function serialize(data: unknown): string {
  return JSON.stringify(data) + '\n';
}

/**
 * Create an NDJSON streaming parser.
 *
 * Returns a function that accepts Buffer chunks and emits parsed JSON objects
 * via the onMessage callback. Handles:
 * - Partial lines split across chunks (buffered until newline arrives)
 * - Multiple messages in a single chunk
 * - Empty lines (skipped)
 * - Invalid JSON (logged via logError, line skipped)
 * - SEC-009: Buffer overflow protection (max 1MB)
 */
export function createNdjsonParser(
  onMessage: (data: unknown) => void,
): (chunk: Buffer) => void {
  let buffer = '';

  return (chunk: Buffer): void => {
    buffer += chunk.toString('utf8');

    // SEC-009: Enforce max buffer size to prevent memory exhaustion
    if (Buffer.byteLength(buffer, 'utf8') > MAX_BUFFER_BYTES) {
      logError('NDJSON buffer exceeded 1MB limit, resetting', new Error('buffer overflow'));
      buffer = '';
      return;
    }

    const lines = buffer.split('\n');

    // Last element is either empty (if chunk ended with \n) or a partial line.
    // Keep it in the buffer for the next chunk.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(trimmed);
        onMessage(parsed);
      } catch {
        logError('NDJSON parse error, skipping line', new Error(trimmed));
      }
    }
  };
}
