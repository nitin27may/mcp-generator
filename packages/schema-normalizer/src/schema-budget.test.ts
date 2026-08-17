import { describe, expect, it } from 'vitest';
import { checkSchemaBudget, DEFAULT_SCHEMA_BUDGET } from './schema-budget.js';

describe('checkSchemaBudget', () => {
  it('produces no warnings for a schema well within budget', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } };
    expect(checkSchemaBudget(schema)).toEqual([]);
  });

  it('warns, never truncates, when property count exceeds the budget', () => {
    const properties = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`p${i}`, { type: 'string' }]));
    const warnings = checkSchemaBudget({ type: 'object', properties }, { ...DEFAULT_SCHEMA_BUDGET, maxProperties: 3 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ keyword: 'properties' });
    expect(warnings[0]?.message).toContain('5 properties');
  });

  it('warns when nesting exceeds maxDepth', () => {
    const deep = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'string' } } } } } } };
    const warnings = checkSchemaBudget(deep, { ...DEFAULT_SCHEMA_BUDGET, maxDepth: 1 });
    expect(warnings.some((w) => w.keyword === 'depth')).toBe(true);
  });

  it.each(['oneOf', 'anyOf', 'allOf'] as const)('warns when %s exceeds maxUnionBranches', (combinator) => {
    const schema = { [combinator]: [{ type: 'string' }, { type: 'integer' }, { type: 'boolean' }] };
    const warnings = checkSchemaBudget(schema, { ...DEFAULT_SCHEMA_BUDGET, maxUnionBranches: 2 });
    expect(warnings.some((w) => w.keyword === combinator)).toBe(true);
  });

  it('descends into array items', () => {
    const schema = { type: 'array', items: { oneOf: [{}, {}, {}] } };
    const warnings = checkSchemaBudget(schema, { ...DEFAULT_SCHEMA_BUDGET, maxUnionBranches: 1 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.sourcePointer).toBe('/items');
  });

  it('reports every violation, not just the first', () => {
    const schema = {
      properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
      oneOf: [{}, {}, {}],
    };
    const warnings = checkSchemaBudget(schema, { ...DEFAULT_SCHEMA_BUDGET, maxProperties: 1, maxUnionBranches: 1 });
    expect(warnings.map((w) => w.keyword).sort()).toEqual(['oneOf', 'properties']);
  });

  it('reports the pointer where the violation occurred', () => {
    const schema = { properties: { nested: { properties: { deep: { type: 'string' } } } } };
    const warnings = checkSchemaBudget(schema, { ...DEFAULT_SCHEMA_BUDGET, maxDepth: 1 });
    expect(warnings[0]?.sourcePointer).toBe('/properties/nested/properties/deep');
  });

  it('ignores non-object schemas (e.g. boolean schemas) without throwing', () => {
    expect(checkSchemaBudget(true)).toEqual([]);
    expect(checkSchemaBudget(null)).toEqual([]);
    expect(checkSchemaBudget('not a schema')).toEqual([]);
  });
});
