/**
 * SLM Mesh — Broker Entry Point
 * Standalone entry for the broker daemon process (spawned by ensure.ts).
 * Copyright 2026 Varun Pratap Bhardwaj. MIT License.
 * Part of the Qualixar research initiative
 */

import { Broker } from './broker.js';
import { createConfig } from '../config.js';

const config = createConfig();
const broker = new Broker(config);

broker.start().catch((err) => {
  console.error(`[slm-mesh] Broker fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
