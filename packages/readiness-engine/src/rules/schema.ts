import type { CanonicalApi } from '@mcpgen/domain';
import { checkSchemaBudget } from '@mcpgen/schema-normalizer';
import { finding, operationLabel, operationSchemas } from '../helpers.js';
import type { ReadinessFinding, ReadinessRule } from '../types.js';

const MAX_DEPTH = 8;
const MAX_UNION_BRANCHES = 10;
const MAX_REQUIRED_FIELDS = 15;
const BINARY_FORMATS = new Set(['binary', 'byte']);

function walkSchemas(api: CanonicalApi, visit: (schema: Record<string, unknown>, op: (typeof api.operations)[number]) => ReadinessFinding[]): ReadinessFinding[] {
  const findings: ReadinessFinding[] = [];
  for (const op of api.operations) {
    for (const schema of operationSchemas(op)) findings.push(...visit(schema, op));
  }
  return findings;
}

export const excessiveDepth: ReadinessRule = {
  id: 'ARA-SCHEMA-001',
  category: 'schema-usability',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      const warnings = checkSchemaBudget(schema, { maxDepth: MAX_DEPTH, maxProperties: Infinity, maxUnionBranches: Infinity, maxRefExpansions: Infinity });
      return warnings
        .filter((w) => w.keyword === 'depth')
        .map(() => finding('ARA-SCHEMA-001', 'schema-usability', 'high', 'Excessive schema nesting', `A schema on ${operationLabel(op)} nests deeper than ${MAX_DEPTH} levels — hard for an agent to reason about.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Flatten the schema or split it into smaller referenced pieces.' }));
    });
  },
};

export const freeFormObject: ReadinessRule = {
  id: 'ARA-SCHEMA-002',
  category: 'schema-usability',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      if (schema.type === 'object' && !schema.properties && schema.additionalProperties !== false) {
        return [finding('ARA-SCHEMA-002', 'schema-usability', 'high', 'Free-form object', `A schema on ${operationLabel(op)} accepts arbitrary object keys with no declared shape.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Declare explicit properties, or set additionalProperties: false if intentional.' })];
      }
      return [];
    });
  },
};

export const largeRequiredFieldCount: ReadinessRule = {
  id: 'ARA-SCHEMA-003',
  category: 'schema-usability',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      const required = schema.required;
      if (Array.isArray(required) && required.length > MAX_REQUIRED_FIELDS) {
        return [finding('ARA-SCHEMA-003', 'schema-usability', 'warning', 'Large required-field count', `A schema on ${operationLabel(op)} requires ${required.length} fields, exceeding ${MAX_REQUIRED_FIELDS}.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Reconsider which fields are truly required, or split the operation.' })];
      }
      return [];
    });
  },
};

export const excessiveUnionBranches: ReadinessRule = {
  id: 'ARA-SCHEMA-004',
  category: 'schema-usability',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      const warnings = checkSchemaBudget(schema, { maxDepth: Infinity, maxProperties: Infinity, maxUnionBranches: MAX_UNION_BRANCHES, maxRefExpansions: Infinity });
      return warnings
        .filter((w) => w.keyword === 'oneOf' || w.keyword === 'anyOf' || w.keyword === 'allOf')
        .map((w) => finding('ARA-SCHEMA-004', 'schema-usability', 'high', 'Excessive union branches', `A "${w.keyword}" schema on ${operationLabel(op)} has more than ${MAX_UNION_BRANCHES} branches.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Reduce the number of alternatives or restructure the schema.' }));
    });
  },
};

export const binaryPayload: ReadinessRule = {
  id: 'ARA-SCHEMA-005',
  category: 'schema-usability',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      const isBinary = typeof schema.format === 'string' && BINARY_FORMATS.has(schema.format) || typeof schema.contentMediaType === 'string';
      return isBinary
        ? [finding('ARA-SCHEMA-005', 'schema-usability', 'high', 'Binary input/output', `A schema on ${operationLabel(op)} represents binary data, which MCP tool schemas do not handle well.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Map to a safe resource/link representation instead of raw binary (TIP §23).' })]
        : [];
    });
  },
};

export const recursiveSchema: ReadinessRule = {
  id: 'ARA-SCHEMA-006',
  category: 'schema-usability',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      return hasCycle(schema)
        ? [finding('ARA-SCHEMA-006', 'schema-usability', 'high', 'Recursive schema complexity', `A schema on ${operationLabel(op)} contains a circular structure.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Bound the recursion depth explicitly or flatten the recursive relationship.' })]
        : [];
    });
  },
};

function hasCycle(schema: unknown, ancestors: Set<unknown> = new Set()): boolean {
  if (schema === null || typeof schema !== 'object') return false;
  if (ancestors.has(schema)) return true;
  const nextAncestors = new Set(ancestors).add(schema);
  const node = schema as Record<string, unknown>;

  if (node.properties && typeof node.properties === 'object') {
    for (const value of Object.values(node.properties as Record<string, unknown>)) {
      if (hasCycle(value, nextAncestors)) return true;
    }
  }
  if (node.items && hasCycle(node.items, nextAncestors)) return true;
  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
    const branches = node[keyword];
    if (Array.isArray(branches) && branches.some((b) => hasCycle(b, nextAncestors))) return true;
  }
  return false;
}

export const unionWithoutDiscriminator: ReadinessRule = {
  id: 'ARA-SCHEMA-007',
  category: 'schema-usability',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return walkSchemas(api, (schema, op) => {
      const branches = schema.oneOf ?? schema.anyOf;
      if (Array.isArray(branches) && branches.length > 1 && !schema.discriminator) {
        return [finding('ARA-SCHEMA-007', 'schema-usability', 'warning', 'Union without discriminator', `A oneOf/anyOf schema on ${operationLabel(op)} has no discriminator, making it ambiguous which branch an agent should populate.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Add a discriminator property, or document how to choose a branch.' })];
      }
      return [];
    });
  },
};

export const schemaRules: ReadinessRule[] = [
  excessiveDepth,
  freeFormObject,
  largeRequiredFieldCount,
  excessiveUnionBranches,
  binaryPayload,
  recursiveSchema,
  unionWithoutDiscriminator,
];
