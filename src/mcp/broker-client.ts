/**
 * SLM Mesh -- Broker HTTP Client
 * Simple fetch wrapper for MCP server -> broker communication.
 * Supports local (token file) and remote (shared secret) auth.
 * Part of the Qualixar research initiative
 */

import { createConfig } from '../config.js';
import { readTokenFile } from '../broker/token.js';

const REQUEST_TIMEOUT_MS = 5000;

/** Paths that do not require bearer token authentication. */
const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health']);

let _cachedToken: string | null = null;
let _cachedHost: string | null = null;

function resolveAuth(): { token: string | null; host: string } {
  const config = createConfig();
  const host = config.brokerHost;
  if (_cachedToken !== null && _cachedHost === host) {
    return { token: _cachedToken, host };
  }
  _cachedHost = host;
  if (config.sharedSecret) {
    _cachedToken = config.sharedSecret;
  } else {
    _cachedToken = readTokenFile(config.tokenPath);
  }
  return { token: _cachedToken, host };
}

function buildHeaders(path: string, isPost: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isPost) {
    headers['Content-Type'] = 'application/json';
  }
  if (!AUTH_EXEMPT_PATHS.has(path)) {
    const { token } = resolveAuth();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function brokerRequest<T = unknown>(
  port: number,
  path: string,
  body?: unknown,
): Promise<T> {
  const { host } = resolveAuth();
  const url = `http://${host}:${port}${path}`;
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
