import { describe, expect, it } from 'vitest';
import { scoreFindings } from './score.js';
import type { ReadinessFinding } from './types.js';

function findingOf(category: ReadinessFinding['category'], severity: ReadinessFinding['severity']): ReadinessFinding {
  return { ruleId: 'X', category, severity, title: 't', explanation: 'e', autoFixAvailable: false };
}

describe('scoreFindings', () => {
  it('scores 100 with no findings at all', () => {
    expect(scoreFindings([]).overallScore).toBe(100);
  });

  it('gives every one of the 8 dimensions a category score, even with zero findings', () => {
    const report = scoreFindings([]);
    expect(report.categoryScores).toHaveLength(8);
    expect(report.categoryScores.every((c) => c.score === 100)).toBe(true);
  });

  it('category weights sum to 100', () => {
    const report = scoreFindings([]);
    expect(report.categoryScores.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });

  it('a critical finding reduces both its category score and the overall score beyond the category weight alone', () => {
    const report = scoreFindings([findingOf('safety', 'critical')]);
    const safety = report.categoryScores.find((c) => c.category === 'safety')!;
    expect(safety.score).toBeLessThan(100);
    // safety weight is 15; a critical finding should cost more than just 15*(reduction) alone
    // because of the additional blocking penalty (TIP §14.5).
    expect(report.overallScore).toBeLessThan(100 - safety.weight * 0.01 * 30);
  });

  it('never goes below 0', () => {
    const findings = Array.from({ length: 50 }, () => findingOf('safety', 'critical'));
    expect(scoreFindings(findings).overallScore).toBe(0);
  });

  it('counts findings per category correctly', () => {
    const report = scoreFindings([findingOf('safety', 'high'), findingOf('safety', 'high'), findingOf('discoverability', 'info')]);
    expect(report.categoryScores.find((c) => c.category === 'safety')?.findingCount).toBe(2);
    expect(report.categoryScores.find((c) => c.category === 'discoverability')?.findingCount).toBe(1);
    expect(report.categoryScores.find((c) => c.category === 'schema-usability')?.findingCount).toBe(0);
  });

  it('is deterministic — identical input produces an identical report', () => {
    const findings = [findingOf('safety', 'high'), findingOf('semantic-clarity', 'warning')];
    expect(scoreFindings(findings)).toEqual(scoreFindings(findings));
  });
});
