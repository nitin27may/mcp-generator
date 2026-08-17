import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/*/test/unit/**/*.test.ts',
            'tooling/*/test/unit/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'golden',
          include: ['packages/*/test/golden/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['packages/test-fixtures/test/e2e/**/*.test.ts', 'apps/*/test/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'security',
          include: ['packages/*/test/security/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
