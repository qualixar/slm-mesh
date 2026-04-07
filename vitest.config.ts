import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',                 // Entry point router (3 lines)
        'src/adapters/backend.ts',      // Pure TypeScript interface — zero runtime code
        'src/adapters/memory-bridge.ts', // Pure TypeScript interface — zero runtime code
        'src/broker/broker-entry.ts',    // Process entry point (process.argv dispatch)
      ],
      thresholds: {
        lines: 100,
        functions: 99,
        branches: 93,
        statements: 100,
      },
    },
  },
});
