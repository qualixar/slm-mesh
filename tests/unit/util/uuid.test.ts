import { describe, it, expect } from 'vitest';
import { generateId } from '../../../src/util/uuid.js';

describe('generateId', () => {
  it('returns a UUID v4 string', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
