import { CATEGORY_WEIGHTS, type ReadinessCategory, type ReadinessFinding, type ReadinessSeverity } from './types.js';

/**
 * TIP §14.5: "Do not make score calculation opaque." Deterministic points
 * per finding severity, summed per category, never below 0. A category
 * with zero findings scores 100 — which is why every dimension having at
 * least one rule (TIP §93 C5) matters: an unscored dimension is not a
 * "good" dimension, it's a blind spot that looks like one.
 */
const SEVERITY_PENALTY: Readonly<Record<ReadinessSeverity, number>> = {
  info: 2,
  warning: 5,
  high: 15,
  critical: 30,
};

/** Any critical finding, anywhere, pulls the overall score down beyond its own category (TIP §14.5). */
const BLOCKING_PENALTY_PER_CRITICAL = 10;

export interface CategoryScore {
  readonly category: ReadinessCategory;
  readonly score: number;
  readonly weight: number;
  readonly findingCount: number;
}

export interface ReadinessReport {
  readonly overallScore: number;
  readonly categoryScores: readonly CategoryScore[];
  readonly findings: readonly ReadinessFinding[];
}

function categoryScore(findings: readonly ReadinessFinding[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return Math.max(0, 100 - penalty);
}

export function scoreFindings(findings: readonly ReadinessFinding[]): ReadinessReport {
  const categories = Object.keys(CATEGORY_WEIGHTS) as ReadinessCategory[];
  const categoryScores: CategoryScore[] = categories.map((category) => {
    const categoryFindings = findings.filter((f) => f.category === category);
    return { category, score: categoryScore(categoryFindings), weight: CATEGORY_WEIGHTS[category], findingCount: categoryFindings.length };
  });

  const weightedAverage = categoryScores.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0);
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const overallScore = Math.max(0, Math.round(weightedAverage - criticalCount * BLOCKING_PENALTY_PER_CRITICAL));

  return { overallScore, categoryScores, findings };
}
