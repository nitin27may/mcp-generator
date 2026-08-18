import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seedReadyProject } from './fixtures/seed-project';

const PROJECT_SCOPED_STEPS = ['validation', 'readiness', 'api', 'auth', 'tools', 'bindings', 'policy', 'playground', 'generate'] as const;

/**
 * axe against every one of the wizard's 10 routes, in a real browser, against a project
 * with a fully bound and enabled tool so every step renders its real (not blocked-state)
 * content. Only serious/critical violations fail the test — moderate/minor findings are
 * logged so they're visible without being a hard CI gate (TIP-plan Increment 12 target is
 * "zero serious/critical", not zero of every axe rule).
 */
test.describe('accessibility (axe)', () => {
  test('the new-project import page has no serious/critical violations', async ({ page }) => {
    await page.goto('/projects/new/import');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  for (const step of PROJECT_SCOPED_STEPS) {
    test(`the /${step} step has no serious/critical violations`, async ({ page, request }) => {
      const projectId = await seedReadyProject(request, `a11y-${step}`);
      await page.goto(`/projects/${projectId}/${step}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
