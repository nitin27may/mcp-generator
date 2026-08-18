import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const CUSTOMER_SPEC = readFileSync(CUSTOMER_SPEC_PATH, 'utf8');

/**
 * A real browser walking the wizard end to end — the only test in this repo
 * that exercises client-side JS (React hydration, TanStack Query, the
 * autosave debounce) rather than calling Route Handlers directly. Scoped to
 * what's built so far (import through the playground dry-run); extended as
 * later increments land generation.
 */
test('import → validate → analyze → configure → enable a tool → dry-run preview', async ({ page }) => {
  await page.goto('/projects/new/import');
  await page.getByLabel('OpenAPI document').fill(CUSTOMER_SPEC);
  await page.getByRole('button', { name: 'Import' }).click();

  await expect(page.getByText('Imported successfully')).toBeVisible();
  await page.getByLabel('Project name').fill('Playwright Happy Path');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/validation$/);
  await expect(page.getByRole('heading', { name: 'Validation', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to readiness' }).click();

  await expect(page).toHaveURL(/\/readiness$/);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await expect(page.getByText(/out of 100/)).toBeVisible();
  await page.getByRole('link', { name: 'Continue to API defaults' }).click();

  await expect(page).toHaveURL(/\/api$/);
  await page.getByRole('link', { name: 'Continue to authentication' }).click();

  await expect(page).toHaveURL(/\/auth$/);
  await page.getByRole('link', { name: 'Continue to tools' }).click();

  await expect(page).toHaveURL(/\/tools$/);
  const getCustomerRow = page.getByRole('row', { name: /\/customers\/\{customerId\}/ });
  await getCustomerRow.getByRole('checkbox').check();
  await expect(getCustomerRow.getByRole('checkbox')).toBeChecked();

  // The autosave debounce (600ms) needs to actually fire and land before we navigate away —
  // the SaveIndicator's live region is the real, user-visible signal for that, not an arbitrary wait.
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  await page.getByRole('link', { name: 'Continue to parameter binding' }).click();
  await expect(page).toHaveURL(/\/bindings$/);
  await expect(page.getByRole('heading', { name: 'Runtime configuration' })).toBeVisible();

  await page.getByRole('link', { name: 'Continue to safety' }).click();
  await expect(page).toHaveURL(/\/policy$/);
  await expect(page.getByText('getCustomer')).toBeVisible();

  await page.getByRole('link', { name: 'Continue to test' }).click();
  await expect(page).toHaveURL(/\/playground$/);

  await page.getByLabel('customer_id').fill('cust_e2e_001');
  await page.getByRole('button', { name: 'Preview request' }).click();

  await expect(page.getByText('GET')).toBeVisible();
  await expect(page.getByText(/\/customers\/cust_e2e_001/)).toBeVisible();
});
