import { describe, expect, it } from 'vitest';
import { api, op, param, schemaRef } from '../test-helpers.js';
import {
  binaryPayload,
  excessiveDepth,
  excessiveUnionBranches,
  freeFormObject,
  largeRequiredFieldCount,
  recursiveSchema,
  unionWithoutDiscriminator,
} from './schema.js';

function nested(depth: number): Record<string, unknown> {
  let schema: Record<string, unknown> = { type: 'string' };
  for (let i = 0; i < depth; i++) schema = { type: 'object', properties: { child: schema } };
  return schema;
}

describe('ARA-SCHEMA-001 excessiveDepth', () => {
  it('flags a deeply nested schema', () => {
    expect(excessiveDepth.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef(nested(12)) })] })]))).toHaveLength(1);
  });
  it('does not flag a shallow schema', () => {
    expect(excessiveDepth.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef(nested(1)) })] })]))).toHaveLength(0);
  });
});

describe('ARA-SCHEMA-002 freeFormObject', () => {
  it('flags an object schema with no properties and no additionalProperties restriction', () => {
    expect(freeFormObject.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'object' }) })] })]))).toHaveLength(1);
  });
  it('does not flag an object schema with declared properties', () => {
    expect(freeFormObject.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'object', properties: { a: { type: 'string' } } })})] })]))).toHaveLength(0);
  });
  it('does not flag an object schema with additionalProperties: false', () => {
    expect(freeFormObject.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'object', additionalProperties: false }) })] })]))).toHaveLength(0);
  });
});

describe('ARA-SCHEMA-003 largeRequiredFieldCount', () => {
  it('flags a schema requiring more than the threshold', () => {
    const required = Array.from({ length: 20 }, (_, i) => `f${i}`);
    expect(largeRequiredFieldCount.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'object', required }) })] })]))).toHaveLength(1);
  });
  it('does not flag a schema with few required fields', () => {
    expect(largeRequiredFieldCount.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'object', required: ['a'] }) })] })]))).toHaveLength(0);
  });
});

describe('ARA-SCHEMA-004 excessiveUnionBranches', () => {
  it('flags a oneOf with too many branches', () => {
    const branches = Array.from({ length: 15 }, () => ({ type: 'string' }));
    expect(excessiveUnionBranches.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ oneOf: branches }) })] })]))).toHaveLength(1);
  });
  it('does not flag a oneOf with few branches', () => {
    expect(excessiveUnionBranches.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ oneOf: [{ type: 'string' }, { type: 'integer' }] }) })] })]))).toHaveLength(0);
  });
});

describe('ARA-SCHEMA-005 binaryPayload', () => {
  it('flags a binary-format schema', () => {
    expect(binaryPayload.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'string', format: 'binary' }) })] })]))).toHaveLength(1);
  });
  it('does not flag a plain string schema', () => {
    expect(binaryPayload.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'string' }) })] })]))).toHaveLength(0);
  });
});

describe('ARA-SCHEMA-006 recursiveSchema', () => {
  it('flags a schema with a circular object reference', () => {
    const node: Record<string, unknown> = { type: 'object', properties: {} };
    (node.properties as Record<string, unknown>).children = { type: 'array', items: node };
    expect(recursiveSchema.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef(node) })] })]))).toHaveLength(1);
  });
  it('does not flag a non-recursive schema', () => {
    expect(recursiveSchema.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ type: 'object', properties: { a: { type: 'string' } } }) })] })]))).toHaveLength(0);
  });
});

describe('ARA-SCHEMA-007 unionWithoutDiscriminator', () => {
  it('flags a oneOf with no discriminator', () => {
    expect(unionWithoutDiscriminator.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ oneOf: [{ type: 'string' }, { type: 'integer' }] }) })] })]))).toHaveLength(1);
  });
  it('does not flag a oneOf that declares a discriminator', () => {
    expect(unionWithoutDiscriminator.evaluate(api([op({ parameters: [param({ sourceName: 'x', schema: schemaRef({ oneOf: [{ type: 'object' }], discriminator: { propertyName: 'kind' } }) })] })]))).toHaveLength(0);
  });
});
