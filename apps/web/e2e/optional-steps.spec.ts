import { expect, test } from '@playwright/test';
import { seedReadyProject } from './fixtures/seed-project';

/**
 * Phase 6 of the onboarding follow-up: every step past Validation and Tools was
 * always *technically* skippable, but nothing on screen said so. These specs pin
 * the two halves of that claim — that Safety and Test now offer a real "Skip for
 * now" affordance that actually reaches Generate, and that Authentication does
 * not, because the seed spec (`fixtures/openapi-3.1/customer.json`) declares a
 * `bearerAuth` scheme. Telling a user that a credentialed API's auth step is
 * skippable would produce a server that starts and then fails every upstream
 * call, so the negative case matters more than the positive one.
 */
test.describe('optional-step affordances', () => {
  test('safety and test are skippable, and skipping both still reaches generate', async ({ page, request }) => {
    const projectId = await seedReadyProject(request, 'optional-skip');

    await page.goto(`/projects/${projectId}/policy`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('This step is optional — you can skip it and come back later.')).toBeVisible();
    await page.getByRole('link', { name: 'Skip for now' }).click();

    await expect(page).toHaveURL(/\/playground$/);
    await expect(page.getByText('This step is optional — you can skip it and come back later.')).toBeVisible();
    await page.getByRole('link', { name: 'Skip for now' }).click();

    await expect(page).toHaveURL(/\/generate$/);
    await expect(page.getByRole('button', { name: 'Generate package' })).toBeEnabled();
  });

  test('the step nav tags safety and test as optional, but not authentication', async ({ page, request }) => {
    const projectId = await seedReadyProject(request, 'optional-nav');
    await page.goto(`/projects/${projectId}/policy`);

    const nav = page.getByRole('navigation', { name: 'Wizard steps' });
    await expect(nav.getByRole('link', { name: /^Safety Optional/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /^Test Optional/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /^Authentication Optional/ })).toHaveCount(0);
  });

  test('authentication is not presented as skippable when the spec declares a security scheme', async ({ page, request }) => {
    const projectId = await seedReadyProject(request, 'optional-auth-required');

    await page.goto(`/projects/${projectId}/auth`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skip for now' })).toHaveCount(0);
    await expect(page.getByText('This step is optional — you can skip it and come back later.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continue to tools' })).toBeVisible();
  });
});
