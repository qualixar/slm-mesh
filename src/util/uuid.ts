/**
 * SLM Mesh — UUID generation
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * https://github.com/qualixar/slm-mesh
 */

import { randomUUID } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}
