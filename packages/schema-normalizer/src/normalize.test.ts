import type { CanonicalSchema } from '@mcpgen/domain';
import { describe, expect, it } from 'vitest';
import { normalizeSchemaForMcp } from './normalize.js';

function canonical(schema: Record<string, unknown>, warnings: CanonicalSchema['warnings'] = []): CanonicalSchema {
  return { kind: 'json-schema', dialect: '2020-12', schema, sourceDialect: 'json-schema-2020-12', warnings };
}

describe('normalizeSchemaForMcp', () => {
  it('sanitizes OpenAPI-only keywords out of the schema', () => {
    const result = normalizeSchemaForMcp(canonical({ type: 'object', discriminator: { propertyName: 'k' } }));
    expect(result.schema).toEqual({ type: 'object' });
  });

  it('appends budget warnings without discarding pre-existing ones', () => {
    const existing = [{ message: 'pre-existing', keyword: 'other' }];
    const properties = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`p${i}`, { type: 'string' }]));
    const result = normalizeSchemaForMcp(canonical({ type: 'object', properties }, existing));

    expect(result.warnings).toContainEqual(existing[0]);
    expect(result.warnings.some((w) => w.keyword === 'properties')).toBe(true);
  });

  it('produces no new warnings for a small, clean schema', () => {
    const result = normalizeSchemaForMcp(canonical({ type: 'object', properties: { id: { type: 'string' } } }));
    expect(result.warnings).toEqual([]);
  });

  it('preserves every other CanonicalSchema field', () => {
    const input = canonical({ type: 'string' });
    const result = normalizeSchemaForMcp(input);
    expect(result.kind).toBe('json-schema');
    expect(result.dialect).toBe('2020-12');
    expect(result.sourceDialect).toBe('json-schema-2020-12');
  });

  it('does not mutate the input CanonicalSchema', () => {
    const input = canonical({ type: 'object', xml: { name: 'x' } });
    const before = structuredClone(input);
    normalizeSchemaForMcp(input);
    expect(input).toEqual(before);
  });
});
