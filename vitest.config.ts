import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['apps/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'tests/architecture/fixtures/**', '**/*.e2e.test.ts'],
        },
      },
      {
        // Real PostgreSQL via Testcontainers (needs Docker).
        test: {
          name: 'e2e',
          include: ['apps/api/src/**/*.e2e.test.ts'],
          globalSetup: ['apps/api/src/e2e/tests/global-setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 240_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
