import { fileURLToPath } from 'node:url';
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
            'apps/*/src/**/*.test.ts',
            'apps/*/test/unit/**/*.test.ts',
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
          include: ['packages/*/test/security/**/*.test.ts', 'apps/*/test/security/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/*/test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
        // Route handlers under apps/web/src/app/api/** use the `@/*` -> `apps/web/src/*`
        // alias Next.js resolves via tsconfig at build/dev time; vitest doesn't read
        // tsconfig paths on its own, so integration tests need the same mapping here.
        resolve: {
          alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
        },
      },
      {
        test: {
          name: 'component',
          include: ['apps/web/src/**/*.component.test.tsx'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
