import { describe, expect, it } from 'vitest';
import { ALL_RULES, analyzeReadiness } from './analyze.js';
import { api, op } from './test-helpers.js';
import { CATEGORY_WEIGHTS, type ReadinessCategory } from './types.js';

describe('ALL_RULES — the TIP §85 registry', () => {
  it('has exactly 31 rules — the v1.0 "20-30" estimate plus ARA-RESP-001, added to close the response-quality gap (TIP §93 C5)', () => {
    expect(ALL_RULES).toHaveLength(31);
  });

  it('has no duplicate rule IDs', () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all 8 scoring dimensions with at least one rule — TIP §93 C5', () => {
    const covered = new Set(ALL_RULES.map((r) => r.category));
    for (const category of Object.keys(CATEGORY_WEIGHTS) as ReadinessCategory[]) {
      expect(covered.has(category), `no rule covers "${category}"`).toBe(true);
    }
  });
});

describe('analyzeReadiness', () => {
  it('is deterministic — the same CanonicalApi produces byte-identical findings (ADR-0007)', () => {
    const fixture = api([op({ operationId: 'get', description: undefined })]);
    expect(analyzeReadiness(fixture)).toEqual(analyzeReadiness(fixture));
  });

  it('runs fully without any AI dependency — the engine has none to disable (ADR-0007)', () => {
    const fixture = api([op()]);
    expect(() => analyzeReadiness(fixture)).not.toThrow();
  });

  it('a clean, well-documented API scores highly', () => {
    const report = analyzeReadiness(
      api([
        op({
          operationId: 'getCustomer',
          summary: 'Fetch a customer',
          description: 'Fetches a single customer record by its unique identifier.',
          security: [{ schemeName: 'bearerAuth', scopes: [] }],
        }),
      ]),
    );
    expect(report.overallScore).toBeGreaterThan(90);
  });

  it('a poorly documented, unsafe API scores low', () => {
    const report = analyzeReadiness(
      api(
        [
          op({ operationId: undefined, method: 'DELETE', path: '/admin/bulk-delete-users', description: undefined, security: [] }),
        ],
        { servers: [] },
      ),
    );
    expect(report.overallScore).toBeLessThan(60);
  });
});
