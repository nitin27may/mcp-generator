import { describe, expect, it } from 'vitest';
import { validateMcpHeaderAnnotations } from './x-mcp-header.js';

const schemaWith = (region: Record<string, unknown>) => ({
  type: 'object',
  properties: { region },
});

describe('validateMcpHeaderAnnotations', () => {
  it('accepts a valid annotation on a top-level string property', () => {
    const diagnostics = validateMcpHeaderAnnotations(schemaWith({ type: 'string', 'x-mcp-header': 'Region' }));
    expect(diagnostics).toEqual([]);
  });

  it.each(['string', 'integer', 'boolean'])('accepts type %s', (type) => {
    const diagnostics = validateMcpHeaderAnnotations(schemaWith({ type, 'x-mcp-header': 'X-Value' }));
    expect(diagnostics).toEqual([]);
  });

  it('rejects type number — explicitly excluded by the specification', () => {
    const diagnostics = validateMcpHeaderAnnotations(schemaWith({ type: 'number', 'x-mcp-header': 'Value' }));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('only permitted on string, integer, or boolean');
  });

  it('rejects type object', () => {
    const diagnostics = validateMcpHeaderAnnotations(
      schemaWith({ type: 'object', 'x-mcp-header': 'Value', properties: {} }),
    );
    expect(diagnostics).toHaveLength(1);
  });

  it('rejects an empty annotation value', () => {
    const diagnostics = validateMcpHeaderAnnotations(schemaWith({ type: 'string', 'x-mcp-header': '' }));
    expect(diagnostics[0]?.message).toContain('must not be empty');
  });

  it('rejects a value containing invalid token characters (e.g. a space)', () => {
    const diagnostics = validateMcpHeaderAnnotations(schemaWith({ type: 'string', 'x-mcp-header': 'X Region' }));
    expect(diagnostics[0]?.message).toContain('not a valid HTTP field-name token');
  });

  it('rejects a value containing a colon (not a valid tchar)', () => {
    const diagnostics = validateMcpHeaderAnnotations(schemaWith({ type: 'string', 'x-mcp-header': 'X:Region' }));
    expect(diagnostics[0]?.message).toContain('not a valid HTTP field-name token');
  });

  it('detects case-insensitive duplicates across the schema', () => {
    const schema = {
      type: 'object',
      properties: {
        region: { type: 'string', 'x-mcp-header': 'Region' },
        Region2: { type: 'string', 'x-mcp-header': 'region' },
      },
    };
    const diagnostics = validateMcpHeaderAnnotations(schema);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('duplicates');
  });

  it('allows two distinct header names to coexist', () => {
    const schema = {
      type: 'object',
      properties: {
        region: { type: 'string', 'x-mcp-header': 'Region' },
        tenant: { type: 'string', 'x-mcp-header': 'Tenant' },
      },
    };
    expect(validateMcpHeaderAnnotations(schema)).toEqual([]);
  });

  it('rejects an annotation reached only through "items" (array element)', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string', 'x-mcp-header': 'Tag' } },
      },
    };
    const diagnostics = validateMcpHeaderAnnotations(schema);
    expect(diagnostics[0]?.message).toContain('not statically reachable');
  });

  it.each(['oneOf', 'anyOf', 'allOf'] as const)('rejects an annotation reached only through "%s"', (keyword) => {
    const schema = { [keyword]: [{ type: 'string', 'x-mcp-header': 'Value' }] };
    const diagnostics = validateMcpHeaderAnnotations(schema);
    expect(diagnostics[0]?.message).toContain('not statically reachable');
  });

  it('rejects an annotation reached only through "not"', () => {
    const schema = { not: { type: 'string', 'x-mcp-header': 'Value' } };
    const diagnostics = validateMcpHeaderAnnotations(schema);
    expect(diagnostics[0]?.message).toContain('not statically reachable');
  });

  it('allows a nested object property reached via a properties-only chain', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'object', properties: { region: { type: 'string', 'x-mcp-header': 'Region' } } },
      },
    };
    expect(validateMcpHeaderAnnotations(schema)).toEqual([]);
  });

  it('accepts a nullable-style type array of only allowed primitives', () => {
    const diagnostics = validateMcpHeaderAnnotations(
      schemaWith({ type: ['string', 'boolean'], 'x-mcp-header': 'Value' }),
    );
    expect(diagnostics).toEqual([]);
  });

  it('rejects a type array containing a disallowed member', () => {
    const diagnostics = validateMcpHeaderAnnotations(
      schemaWith({ type: ['string', 'number'], 'x-mcp-header': 'Value' }),
    );
    expect(diagnostics).toHaveLength(1);
  });

  it('returns no diagnostics for a schema with no annotations at all', () => {
    expect(validateMcpHeaderAnnotations({ type: 'object', properties: { a: { type: 'string' } } })).toEqual([]);
  });

  it('reports every violation, not just the first', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number', 'x-mcp-header': 'A' },
        b: { type: 'string', 'x-mcp-header': '' },
      },
    };
    expect(validateMcpHeaderAnnotations(schema)).toHaveLength(2);
  });
});
