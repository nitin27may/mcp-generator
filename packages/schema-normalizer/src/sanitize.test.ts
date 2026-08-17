import { describe, expect, it } from 'vitest';
import { sanitizeForMcp } from './sanitize.js';

describe('sanitizeForMcp', () => {
  it('strips discriminator, xml, and externalDocs at the top level', () => {
    const out = sanitizeForMcp({
      type: 'object',
      discriminator: { propertyName: 'kind' },
      xml: { name: 'Thing' },
      externalDocs: { url: 'https://example.com' },
    });
    expect(out).toEqual({ type: 'object' });
  });

  it('strips them at any nesting depth', () => {
    const out = sanitizeForMcp({
      type: 'object',
      properties: { pet: { oneOf: [{ discriminator: { propertyName: 'type' }, type: 'object' }] } },
    }) as any;
    expect(out.properties.pet.oneOf[0]).toEqual({ type: 'object' });
  });

  it('preserves x-mcp-header and other x-* extensions untouched', () => {
    const out = sanitizeForMcp({ type: 'string', 'x-mcp-header': 'Region', 'x-custom': 'anything' });
    expect(out).toEqual({ type: 'string', 'x-mcp-header': 'Region', 'x-custom': 'anything' });
  });

  it('preserves ordinary JSON Schema keywords', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', enum: ['a', 'b'] } },
      additionalProperties: false,
    };
    expect(sanitizeForMcp(schema)).toEqual(schema);
  });

  it('recurses through arrays', () => {
    const out = sanitizeForMcp([{ xml: {}, type: 'string' }, { type: 'integer' }]);
    expect(out).toEqual([{ type: 'string' }, { type: 'integer' }]);
  });

  it('passes primitives through unchanged', () => {
    expect(sanitizeForMcp('x')).toBe('x');
    expect(sanitizeForMcp(42)).toBe(42);
    expect(sanitizeForMcp(true)).toBe(true);
    expect(sanitizeForMcp(null)).toBeNull();
  });

  it('does not mutate the input', () => {
    const input = { type: 'object', xml: { name: 'x' } };
    const copy = structuredClone(input);
    sanitizeForMcp(input);
    expect(input).toEqual(copy);
  });
});
