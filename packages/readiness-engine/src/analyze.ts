import type { CanonicalApi } from '@mcpgen/domain';
import { authRuntimeRules } from './rules/auth-runtime.js';
import { documentationRules } from './rules/documentation.js';
import { namingRules } from './rules/naming.js';
import { responseRules } from './rules/response.js';
import { safetyRules } from './rules/safety.js';
import { schemaRules } from './rules/schema.js';
import { toolSetRules } from './rules/tool-set.js';
import { scoreFindings, type ReadinessReport } from './score.js';
import type { ReadinessRule } from './types.js';

/**
 * TIP §85 — the authoritative registry. 31 rules, not the "30" TIP §93 C1
 * settled on: building the engine surfaced the C5 gap it had only flagged
 * (response-quality had zero rules of its own) and closed it with
 * ARA-RESP-001 rather than leaving the dimension vacuous. Accuracy over the
 * round number.
 */
export const ALL_RULES: readonly ReadinessRule[] = [
  ...namingRules,
  ...documentationRules,
  ...schemaRules,
  ...toolSetRules,
  ...safetyRules,
  ...authRuntimeRules,
  ...responseRules,
];

/**
 * TIP §14.1. Deterministic and AI-free (ADR-0007) — the same `CanonicalApi`
 * produces byte-identical findings every time, which is what makes this
 * testable and what lets AI augmentation (later) treat these findings as
 * trustworthy input rather than something to double-check.
 */
export function analyzeReadiness(api: CanonicalApi, rules: readonly ReadinessRule[] = ALL_RULES): ReadinessReport {
  const findings = rules.flatMap((rule) => rule.evaluate(api));
  return scoreFindings(findings);
}
