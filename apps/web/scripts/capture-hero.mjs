/**
 * Captures the landing page's hero image from the real running wizard — the same
 * technique every UI increment in this repo used for visual verification, rather
 * than a mockup or a stock illustration that would drift from the actual product.
 *
 * Usage: start the app (`pnpm --filter @mcpgen/web dev`), then
 *   node apps/web/scripts/capture-hero.mjs [baseUrl]
 *
 * Re-run this whenever the readiness step's visual design changes; the output is
 * committed, so nothing at build or request time depends on it.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE_URL = process.argv[2] ?? process.env.MCPGEN_BASE_URL ?? 'http://localhost:4200';
const SPEC = readFileSync(fileURLToPath(new URL('../../../fixtures/openapi-3.1/customer.json', import.meta.url)), 'utf8');
const OUT_DIR = fileURLToPath(new URL('../public', import.meta.url));

async function post(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${path} → ${response.status} ${await response.text()}`);
  return response.json();
}

async function main() {
  const { data: imported } = await post('/api/import', { kind: 'paste', text: SPEC });
  const { data: project } = await post('/api/projects', { importId: imported.importId, name: 'Customer API' });

  const config = project.config;
  config.api.baseUrl = { source: 'static', value: 'https://api.example.com' };
  const configResponse = await fetch(`${BASE_URL}/api/projects/${project.id}/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: project.configRevision, config }),
  });
  if (!configResponse.ok) throw new Error(`PUT config → ${configResponse.status} ${await configResponse.text()}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

  // `next dev` injects a floating dev-tools indicator into a `nextjs-portal` custom
  // element. It is not part of the product, so it must not appear in a marketing asset.
  const hideDevOverlay = { content: 'nextjs-portal { display: none !important; }' };

  await page.goto(`${BASE_URL}/projects/${project.id}/readiness`);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await page.getByText(/out of 100/).waitFor({ timeout: 30_000 });
  // The score dial animates in; settle before capturing so the hero isn't a half-drawn arc.
  await page.waitForTimeout(1000);
  await page.addStyleTag(hideDevOverlay);

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: `${OUT_DIR}/hero-readiness.png` });

  await page.goto(`${BASE_URL}/projects/${project.id}/tools`);
  await page.getByRole('heading', { name: 'Tools', level: 1 }).waitFor({ timeout: 30_000 });
  await page.addStyleTag(hideDevOverlay);
  // The fixture has only three operations, so a full-viewport shot is mostly dead
  // space — clip to the content instead of shipping a mostly-empty illustration.
  await page.screenshot({ path: `${OUT_DIR}/hero-tools.png`, clip: { x: 0, y: 0, width: 1280, height: 470 } });

  await browser.close();

  console.log(`wrote ${OUT_DIR}/hero-readiness.png and ${OUT_DIR}/hero-tools.png`);
}

await main();
