import { defineConfig, devices } from '@playwright/test';

/**
 * TIP §51/§93 web-UI plan, Increment 12's E2E hardening — pulled forward to
 * Increment 9 so every subsequent UI increment can be visually verified in
 * a real browser as it's built, not just via curl against the API. `webServer`
 * boots the real app against an isolated `MCPGEN_WORKSPACE_ROOT` so a test
 * run never touches a developer's local workspace state.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The wizard was desktop-only for as long as nothing checked otherwise. `a11y.spec.ts`
    // already ran at 375px, but only against `/` and `/docs` — the nine wizard routes were
    // never rendered narrow by anything. This project is what keeps the responsive work from
    // silently regressing; it runs the a11y and public-page specs at a real phone viewport.
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /(a11y|public-pages)\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm exec next dev --port 4200',
    url: 'http://localhost:4200/api/health',
    reuseExistingServer: !process.env['CI'],
    env: {
      MCPGEN_WORKSPACE_ROOT: process.env['MCPGEN_WORKSPACE_ROOT'] ?? '/tmp/mcpgen-playwright-workspace',
      // The live-execute spec's upstream is a loopback fixture API — this is a controlled test
      // environment, not a real deployment, so opting into private egress here is safe.
      MCPGEN_ALLOW_PRIVATE_EGRESS: 'true',
    },
    timeout: 60_000,
  },
});
