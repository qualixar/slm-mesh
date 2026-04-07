/**
 * SLM Mesh — Schema Tests
 * TDD RED: Written before implementation
 */

import { describe, it, expect } from 'vitest';
import { getSchemaSQL } from '../../../src/db/schema.js';

describe('getSchemaSQL', () => {
  it('returns a non-empty string', () => {
    const sql = getSchemaSQL();
    expect(sql).toBeTruthy();
    expect(typeof sql).toBe('string');
    expect(sql.length).toBeGreaterThan(0);
  });

  it('contains all 6 CREATE TABLE statements', () => {
    const sql = getSchemaSQL();
    const tables = [
      'schema_version',
      'peers',
      'messages',
      'state',
      'locks',
      'events',
    ];
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('contains CHECK constraints for peers.agent_type', () => {
    const sql = getSchemaSQL();
    expect(sql).toMatch(/agent_type\s+TEXT\s+NOT\s+NULL\s+.*CHECK/s);
  });

  it('contains CHECK constraints for peers.status', () => {
    const sql = getSchemaSQL();
    expect(sql).toMatch(/status\s+TEXT\s+NOT\s+NULL\s+.*CHECK/s);
  });

  it('contains CHECK constraint for messages.type', () => {
    const sql = getSchemaSQL();
    expect(sql).toMatch(/type\s+TEXT\s+NOT\s+NULL\s+.*CHECK/s);
  });

  it('contains all required indexes', () => {
    const sql = getSchemaSQL();
    expect(sql).toContain('idx_messages_to_peer');
    expect(sql).toContain('idx_messages_unread');
    expect(sql).toContain('idx_events_type');
    expect(sql).toContain('idx_events_created');
  });

  it('idx_messages_unread is a partial index (WHERE clause)', () => {
    const sql = getSchemaSQL();
    // Partial index should have a WHERE clause
    expect(sql).toMatch(/idx_messages_unread.*WHERE/s);
  });

  it('state table has composite primary key on namespace + key', () => {
    const sql = getSchemaSQL();
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*namespace\s*,\s*key\s*\)/s);
  });
});
