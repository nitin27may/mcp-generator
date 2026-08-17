import type { CanonicalApi } from '@mcpgen/domain';

/**
 * TIP §11 / BRD FR-ARA-002 — the eight scoring dimensions and their weights,
 * summing to 100. Every dimension must have at least one rule (TIP §93 C5:
 * a dimension with zero rules scores a vacuous 100 and silently inflates the
 * overall score by its full weight).
 */
export type ReadinessCategory =
  | 'discoverability'
  | 'semantic-clarity'
  | 'schema-usability'
  | 'tool-set-quality'
  | 'safety'
  | 'authentication-readiness'
  | 'runtime-completeness'
  | 'response-quality';

export const CATEGORY_WEIGHTS: Readonly<Record<ReadinessCategory, number>> = {
  discoverability: 15,
  'semantic-clarity': 20,
  'schema-usability': 15,
  'tool-set-quality': 15,
  safety: 15,
  'authentication-readiness': 10,
  'runtime-completeness': 5,
  'response-quality': 5,
};

export type ReadinessSeverity = 'info' | 'warning' | 'high' | 'critical';

export interface ReadinessFinding {
  readonly ruleId: string;
  readonly severity: ReadinessSeverity;
  readonly category: ReadinessCategory;
  readonly operationId?: string;
  readonly sourcePointer?: string;
  readonly title: string;
  readonly explanation: string;
  readonly remediation?: string;
  readonly autoFixAvailable: boolean;
}

/** TIP §14.2 */
export interface ReadinessRule {
  readonly id: string;
  readonly category: ReadinessCategory;
  readonly severity: ReadinessSeverity;
  evaluate(api: CanonicalApi): ReadinessFinding[];
}
