// Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
/**
 * SLM Mesh -- Broker HTTP Client
 * Simple fetch wrapper for MCP server -> broker communication.
 * Part of the Qualixar research initiative
 */

import { createConfig } from '../config.js';
import { readTokenFile } from '../broker/token.js';

const REQUEST_TIMEOUT_MS = 5000;

/** Paths that do not require bearer token authentication. */
const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health']);

/**
 * Read the bearer token from the standard token file location.
 * Returns the token string or null if unavailable.
 */
function loadBearerToken(): string | null {
  const config = createConfig();
  return readTokenFile(config.tokenPath);
}

/**
 * Build the headers object for a broker request.
 * Includes Authorization header when a token is available and the path requires auth.
 */
function buildHeaders(path: string, isPost: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isPost) {
    headers['Content-Type'] = 'application/json';
  }
  if (!AUTH_EXEMPT_PATHS.has(path)) {
    const token = loadBearerToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

/**
 * Make an HTTP request to the broker.
 *
 * - If `body` is provided: sends POST with JSON body
 * - If `body` is undefined: sends GET
 *
 * Automatically includes the bearer token from disk when available.
 * Returns the parsed JSON response.
 * Throws on connection errors, timeouts, and non-2xx responses.
 */
export async function brokerRequest<T = unknown>(
  port: number,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `http://127.0.0.1:${port}${path}`;
  const isPost = body !== undefined;
  const headers = buildHeaders(path, isPost);

  const response = await fetch(url, {
    method: isPost ? 'POST' : 'GET',
    headers,
    body: isPost ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Broker request ${isPost ? 'POST' : 'GET'} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
    );
  }

  return response.json() as Promise<T>;
}
