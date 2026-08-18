import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startFixtureApi, type FixtureApiHandle } from '@mcpgen/test-fixtures';
import { expect, test } from '@playwright/test';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const CUSTOMER_SPEC = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');
const BEARER_TOKEN = 'playwright-e2e-token';

let api: FixtureApiHandle | undefined;

test.afterEach(async () => {
  await api?.stop();
  api = undefined;
});

/**
 * The one live-execute path this repo cannot verify any other way: a real
 * browser, driving the real wizard, against a real (if local) upstream API
 * — proving the whole chain (UI -> POST /playground/execute -> performExecute
 * -> buildToolRegistry -> real HTTP call -> redaction -> back to the DOM)
 * actually works end to end. Requires `MCPGEN_ALLOW_PRIVATE_EGRESS=true`
 * (set on `playwright.config.ts`'s `webServer` for this reason) since the
 * fixture API is loopback.
 */
test('executes a real tool call for real and shows a redacted trace', async ({ page }) => {
  api = await startFixtureApi({ expectedToken: BEARER_TOKEN });

  await page.goto('/projects/new/import');
  await page.getByLabel('OpenAPI document').fill(CUSTOMER_SPEC);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Imported successfully')).toBeVisible();
  await page.getByLabel('Project name').fill('Live Execute E2E');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/validation$/);

  await page.getByRole('link', { name: 'Continue to readiness' }).click();
  await expect(page).toHaveURL(/\/readiness$/);
  await page.getByRole('link', { name: 'Continue to API defaults' }).click();
  await expect(page).toHaveURL(/\/api$/);

  await page.getByRole('combobox', { name: 'Source' }).click();
  await page.getByRole('option', { name: 'Static value' }).click();
  await page.getByPlaceholder('Value').fill(api.baseUrl);
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.getByRole('link', { name: 'Continue to authentication' }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.getByRole('link', { name: 'Continue to tools' }).click();
  await expect(page).toHaveURL(/\/tools$/);

  const row = page.getByRole('row', { name: /\/customers\/\{customerId\}/ });
  await row.getByRole('checkbox').check();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.getByRole('link', { name: 'Continue to parameter binding' }).click();
  await expect(page).toHaveURL(/\/bindings$/);
  await page.getByRole('link', { name: 'Continue to safety' }).click();
  await expect(page).toHaveURL(/\/policy$/);
  await page.getByRole('link', { name: 'Continue to test' }).click();
  await expect(page).toHaveURL(/\/playground$/);

  await page.getByLabel('customer_id').fill('c-42');
  await page.getByLabel(/_TOKEN$/).fill(BEARER_TOKEN);
  await page.getByRole('button', { name: 'Execute for real' }).click();

  await expect(page.getByText('Success')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('HTTP 200')).toBeVisible();
  await expect(page.getByText('Ada Lovelace')).toBeVisible(); // the real fixture API's real response data
  await expect(page.getByText('[REDACTED]')).toBeVisible(); // the Authorization header, redacted

  // The raw secret literal must never appear anywhere in the rendered page.
  const bodyText = await page.textContent('body');
  expect(bodyText).not.toContain(BEARER_TOKEN);
});

test('requires risk acknowledgement before executing a Destructive tool', async ({ page }) => {
  await page.goto('/projects/new/import');
  await page.getByLabel('OpenAPI document').fill(CUSTOMER_SPEC);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Imported successfully')).toBeVisible();
  await page.getByLabel('Project name').fill('Risk Dialog E2E');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/validation$/);

  await page.getByRole('link', { name: 'Continue to readiness' }).click();
  await page.getByRole('link', { name: 'Continue to API defaults' }).click();
  await page.getByRole('link', { name: 'Continue to authentication' }).click();
  await page.getByRole('link', { name: 'Continue to tools' }).click();
  await expect(page).toHaveURL(/\/tools$/);

  const row = page.getByRole('row', { name: /POST \/customers/ });
  await row.getByRole('checkbox').check();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.getByRole('link', { name: 'Continue to parameter binding' }).click();
  await page.getByRole('link', { name: 'Continue to safety' }).click();
  await expect(page).toHaveURL(/\/policy$/);

  await page.getByRole('combobox', { name: 'Risk' }).click();
  await page.getByRole('option', { name: 'Destructive' }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.getByRole('link', { name: 'Continue to test' }).click();
  await expect(page).toHaveURL(/\/playground$/);
  await page.getByRole('button', { name: 'Execute for real' }).click();

  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByText(/Destructive or.*Privileged/s)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
});
