import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { describe, expect, it } from 'vitest';
import { analyzeReadiness } from '../../src/analyze.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

describe('analyzeReadiness — the real P0 customer-oas31 fixture', () => {
  it('produces a stable, reviewable report matching the committed golden snapshot', async () => {
    const doc = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const parsed = await parseOpenApi(doc, { sourceId: 'customer-oas31' });
    const report = analyzeReadiness(parsed.value!);

    expect(report).toMatchSnapshot();
  });

  it('scores reasonably well — the fixture has summaries, descriptions, auth, and a server', async () => {
    const doc = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const parsed = await parseOpenApi(doc, { sourceId: 'customer-oas31' });
    const report = analyzeReadiness(parsed.value!);

    expect(report.overallScore).toBeGreaterThan(70);
  });

  it('does not flag the fixture for missing auth — every operation inherits bearerAuth', async () => {
    const doc = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const parsed = await parseOpenApi(doc, { sourceId: 'customer-oas31' });
    const report = analyzeReadiness(parsed.value!);

    expect(report.findings.filter((f) => f.ruleId === 'ARA-AUTH-001')).toEqual([]);
  });
});
