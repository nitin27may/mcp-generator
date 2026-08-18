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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec next dev --port 4200',
    url: 'http://localhost:4200/api/health',
    reuseExistingServer: !process.env['CI'],
    env: { MCPGEN_WORKSPACE_ROOT: process.env['MCPGEN_WORKSPACE_ROOT'] ?? '/tmp/mcpgen-playwright-workspace' },
    timeout: 60_000,
  },
});
