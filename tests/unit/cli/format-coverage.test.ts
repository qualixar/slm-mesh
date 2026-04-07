/**
 * SLM Mesh — Format coverage tests
 * Covers: formatBytes GB path, formatUptime edge cases.
 * Copyright 2026 Qualixar (Varun Pratap Bhardwaj). MIT License.
 */

import { describe, it, expect } from 'vitest';
import { formatStatus } from '../../../src/cli/format.js';
import type { BrokerStatus } from '../../../src/types.js';

describe('formatStatus coverage', () => {
  it('formats status with GB-sized database', () => {
    const status: BrokerStatus = {
      status: 'ok',
      version: '1.0.0',
      uptime: 7200, // 2h exactly
      pid: 1234,
      port: 7899,
      peers: { active: 2, stale: 0, total: 2 },
      messages: { total: 100, undelivered: 5 },
      locks: { active: 1 },
      events: { total: 50 },
      db: {
        sizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB
        walSizeBytes: 500 * 1024, // 500 KB
      },
    };
    const output = formatStatus(status);
    expect(output).toContain('2.0 GB');
    expect(output).toContain('500.0 KB');
    expect(output).toContain('2h');
  });

  it('formats status with MB-sized database', () => {
    const status: BrokerStatus = {
      status: 'ok',
      version: '1.0.0',
      uptime: 90, // 1m 30s
      pid: 1234,
      port: 7899,
      peers: { active: 0, stale: 0, total: 0 },
      messages: { total: 0, undelivered: 0 },
      locks: { active: 0 },
      events: { total: 0 },
      db: {
        sizeBytes: 5 * 1024 * 1024, // 5 MB
        walSizeBytes: 100, // 100 B
      },
    };
    const output = formatStatus(status);
    expect(output).toContain('5.0 MB');
    expect(output).toContain('100 B');
    expect(output).toContain('1m 30s');
  });

  it('formats status with seconds-only uptime', () => {
    const status: BrokerStatus = {
      status: 'ok',
      version: '1.0.0',
      uptime: 45,
      pid: 1234,
      port: 7899,
      peers: { active: 0, stale: 0, total: 0 },
      messages: { total: 0, undelivered: 0 },
      locks: { active: 0 },
      events: { total: 0 },
      db: { sizeBytes: 0, walSizeBytes: 0 },
    };
    const output = formatStatus(status);
    expect(output).toContain('45s');
  });

  it('formats status with hours and no minutes', () => {
    const status: BrokerStatus = {
      status: 'ok',
      version: '1.0.0',
      uptime: 3600, // exactly 1h
      pid: 1234,
      port: 7899,
      peers: { active: 0, stale: 0, total: 0 },
      messages: { total: 0, undelivered: 0 },
      locks: { active: 0 },
      events: { total: 0 },
      db: { sizeBytes: 0, walSizeBytes: 0 },
    };
    const output = formatStatus(status);
    expect(output).toContain('1h');
    // Should NOT contain "0m"
    expect(output).not.toContain('0m');
  });
});
