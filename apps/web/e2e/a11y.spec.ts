import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedReadyProject } from './fixtures/seed-project';

const PROJECT_SCOPED_STEPS = ['validation', 'readiness', 'api', 'auth', 'tools', 'bindings', 'policy', 'playground', 'generate'] as const;

/**
 * axe against every one of the wizard's 10 routes, in a real browser, against a project
 * with a fully bound and enabled tool so every step renders its real (not blocked-state)
 * content. Only serious/critical violations fail the test — moderate/minor findings are
 * logged so they're visible without being a hard CI gate (TIP-plan Increment 12 target is
 * "zero serious/critical", not zero of every axe rule).
 */
const PUBLIC_ROUTES = ['/', '/docs'] as const;

/**
 * Runs axe against a settled page.
 *
 * Without this, a scan can land mid-transition and read an interpolated colour — a primary
 * button caught part-way through its hover fade reported 2.49:1 against a background that
 * is 4.5:1+ once settled. That is a false positive, and an intermittent one, which is worse
 * than a real failure: it trains people to re-run CI until it passes.
 *
 * Disabling animation removes the whole class of flake without weakening anything. Every
 * assertion here is about resting-state contrast, which is what a person actually reads.
 */
async function scanSettled(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}


test.describe('accessibility (axe)', () => {
  // The two routes a stranger can reach cold, and the only two built mobile-first —
  // scanned at a narrow viewport as well, since that layout is genuinely different
  // (stacked hero, single-column grids) rather than the same DOM reflowed.
  for (const route of PUBLIC_ROUTES) {
    test(`the public ${route} page has no serious/critical violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const serious = await scanSettled(page);
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });

    test(`the public ${route} page has no serious/critical violations at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const serious = await scanSettled(page);
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }

  test('the new-project import page has no serious/critical violations', async ({ page }) => {
    await page.goto('/projects/new/import');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const serious = await scanSettled(page);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  for (const step of PROJECT_SCOPED_STEPS) {
    test(`the /${step} step has no serious/critical violations`, async ({ page, request }) => {
      const projectId = await seedReadyProject(request, `a11y-${step}`);
      await page.goto(`/projects/${projectId}/${step}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const serious = await scanSettled(page);
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
