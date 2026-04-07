import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    broker: 'src/broker/broker-entry.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  sourcemap: true,
  clean: true,
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
