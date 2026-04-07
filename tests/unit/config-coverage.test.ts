/**
 * SLM Mesh — Config coverage tests
 * Covers: envInt with NaN fallback (line 37).
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createConfig } from '../../src/config.js';

describe('config coverage', () => {
  const origPort = process.env['SLM_MESH_PORT'];

  afterEach(() => {
    if (origPort !== undefined) process.env['SLM_MESH_PORT'] = origPort;
    else delete process.env['SLM_MESH_PORT'];
  });

  it('envInt falls back when env var is NaN', () => {
    process.env['SLM_MESH_PORT'] = 'not-a-number';
    const config = createConfig();
    expect(config.brokerPort).toBe(7899); // default fallback
  });

  it('envInt uses parsed value when valid', () => {
    process.env['SLM_MESH_PORT'] = '9000';
    const config = createConfig();
    expect(config.brokerPort).toBe(9000);
  });
});
