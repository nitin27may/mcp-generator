import type { SchemaDiagnostic } from '@mcpgen/domain';

/**
 * TIP §10.4: bounds on pathological tool schemas. Exceeding a budget produces
 * a warning — it never silently truncates the schema. A simplified variant
 * with explicit review is a possible later feature, not this function's job.
 */
export interface SchemaBudget {
  readonly maxDepth: number;
  readonly maxProperties: number;
  readonly maxUnionBranches: number;
  readonly maxRefExpansions: number;
}

export const DEFAULT_SCHEMA_BUDGET: SchemaBudget = {
  maxDepth: 10,
  maxProperties: 100,
  maxUnionBranches: 20,
  // Not enforced by this function at P0: openapi-adapter fully dereferences
  // every $ref (research notes §12), so a canonical schema never contains one.
  // This budget exists for when partial/lazy resolution is introduced later.
  maxRefExpansions: 50,
};

/**
 * Walks the schema tree and reports every budget violation with the pointer
 * where it occurred. Does not stop at the first violation — a schema can
 * exceed more than one budget, and the caller should see all of them.
 */
export function checkSchemaBudget(
  schema: unknown,
  budget: SchemaBudget = DEFAULT_SCHEMA_BUDGET,
  pointer = '',
  depth = 0,
): SchemaDiagnostic[] {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const node = schema as Record<string, unknown>;
  const warnings: SchemaDiagnostic[] = [];

  if (depth > budget.maxDepth) {
    warnings.push({
      message: `Schema exceeds maximum depth (${depth} > ${budget.maxDepth})`,
      keyword: 'depth',
      sourcePointer: pointer || '#',
    });
    return warnings; // don't keep recursing past a depth violation — one warning, not a flood
  }

  const properties = node.properties;
  if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
    const entries = Object.entries(properties as Record<string, unknown>);
    if (entries.length > budget.maxProperties) {
      warnings.push({
        message: `Object has ${entries.length} properties, exceeding the budget of ${budget.maxProperties}`,
        keyword: 'properties',
        sourcePointer: pointer || '#',
      });
    }
    for (const [key, sub] of entries) {
      warnings.push(...checkSchemaBudget(sub, budget, `${pointer}/properties/${key}`, depth + 1));
    }
  }

  for (const combinator of ['oneOf', 'anyOf', 'allOf'] as const) {
    const branches = node[combinator];
    if (Array.isArray(branches)) {
      if (branches.length > budget.maxUnionBranches) {
        warnings.push({
          message: `"${combinator}" has ${branches.length} branches, exceeding the budget of ${budget.maxUnionBranches}`,
          keyword: combinator,
          sourcePointer: pointer || '#',
        });
      }
      branches.forEach((branch, index) => {
        warnings.push(...checkSchemaBudget(branch, budget, `${pointer}/${combinator}/${index}`, depth + 1));
      });
    }
  }

  if (node.items !== undefined) {
    warnings.push(...checkSchemaBudget(node.items, budget, `${pointer}/items`, depth + 1));
  }

  return warnings;
}
