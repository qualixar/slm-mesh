/**
 * SLM Mesh — Logger (stderr only — stdout reserved for MCP stdio)
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * https://github.com/qualixar/slm-mesh
 */

export function log(msg: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[slm-mesh ${ts}] ${msg}\n`);
}

export function logError(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  log(`ERROR: ${msg}${detail ? ` — ${detail}` : ''}`);
}
