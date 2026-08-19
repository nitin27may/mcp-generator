import { expect, test } from '@playwright/test';

/**
 * `/` and `/docs` are the only routes reachable without a project, and the only
 * ones a stranger can land on from a shared link — so unlike the wizard specs,
 * these check the things a public page is judged on: that it renders standalone,
 * that its calls to action actually go somewhere, and that a shared link carries
 * real metadata rather than the app shell's generic title.
 */
test('the landing page renders standalone and both calls to action navigate', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Your API is not an agent tool surface yet.', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: /Agent Readiness step/ })).toBeVisible();

  await page.getByRole('link', { name: 'Use the CLI instead' }).first().click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole('heading', { name: 'Two ways to use mcpgen', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Start a project' }).click();
  await expect(page).toHaveURL(/\/projects\/new\/import$/);
});

test('the landing page carries its own shareable metadata, not the app shell default', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/agent readiness and governance layer for APIs/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https?:\/\/.+hero-readiness\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
});

test('the docs page does not present authentication as unconditionally skippable', async ({ page }) => {
  await page.goto('/docs');

  const authRow = page.getByRole('listitem').filter({ hasText: 'Authentication' });
  await expect(authRow).toContainText('Optional when your spec declares no security scheme');
  for (const step of ['Safety', 'Test']) {
    await expect(page.getByRole('listitem').filter({ hasText: step }).first()).toContainText('Optional');
  }
});

test('the docs page leads the CLI section with init, and the auth table names every supported scheme', async ({ page }) => {
  await page.goto('/docs');

  await expect(page.getByText('mcpgen init', { exact: false }).first()).toBeVisible();

  const authTable = page.getByRole('region', { name: 'Authentication: env vars, resolved at run time' });
  await expect(authTable.getByRole('cell', { name: 'API key' })).toBeVisible();
  await expect(authTable.getByRole('cell', { name: 'Bearer token' })).toBeVisible();
  await expect(authTable.getByRole('cell', { name: 'Basic auth' })).toBeVisible();
  await expect(authTable.getByRole('cell', { name: 'OAuth2 client credentials' })).toBeVisible();
});
