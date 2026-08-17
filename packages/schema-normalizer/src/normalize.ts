import type { CanonicalSchema } from '@mcpgen/domain';
import { checkSchemaBudget, DEFAULT_SCHEMA_BUDGET, type SchemaBudget } from './schema-budget.js';
import { sanitizeForMcp } from './sanitize.js';

/**
 * TIP §10.3 strategy: source-aware adapter (openapi-adapter) already produced
 * canonical 2020-12 for OAS 3.1; this is the "MCP schema sanitizer" stage —
 * strip OpenAPI-only keywords, then check budgets. Never mutates the input.
 */
export function normalizeSchemaForMcp(
  canonical: CanonicalSchema,
  budget: SchemaBudget = DEFAULT_SCHEMA_BUDGET,
): CanonicalSchema {
  const sanitized = sanitizeForMcp(canonical.schema) as Record<string, unknown>;
  const budgetWarnings = checkSchemaBudget(sanitized, budget);

  return {
    ...canonical,
    schema: sanitized,
    warnings: [...canonical.warnings, ...budgetWarnings],
  };
}
