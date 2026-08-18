import type { Diagnostic } from '@mcpgen/domain';
import { describe, expect, it } from 'vitest';
import { diagnosticToProductError } from './product-error.js';

/** Every code prefix actually thrown anywhere in the engine, plus this build's new PLG and DIFF prefixes. Keep in sync with §88. */
const KNOWN_PREFIXES: Record<string, ProductErrorCategory> = {
  IMP: 'IMPORT',
  VAL: 'VALIDATION',
  CFG: 'VALIDATION',
  BND: 'BINDING',
  AUT: 'AUTH',
  UPS: 'UPSTREAM',
  MCP: 'MCP',
  SEC: 'SECURITY',
  GEN: 'GENERATION',
  PLG: 'SECURITY',
  DIFF: 'VALIDATION',
};

type ProductErrorCategory = ReturnType<typeof diagnosticToProductError>['category'];

function diagnostic(code: string, overrides: Partial<Diagnostic> = {}): Diagnostic {
  return { severity: 'error', code, message: 'x', ...overrides };
}

describe('diagnosticToProductError', () => {
  it('maps every known §88 code prefix to the expected category', () => {
    for (const [prefix, expectedCategory] of Object.entries(KNOWN_PREFIXES)) {
      const result = diagnosticToProductError(diagnostic(`${prefix}-001`));
      expect(result.category, `prefix ${prefix}`).toBe(expectedCategory);
    }
  });

  it('carries code, message, sourcePointer, and operationId (as toolName) through', () => {
    const result = diagnosticToProductError(
      diagnostic('BND-001', { message: 'unbound required parameter', sourcePointer: '#/tools/get_x/bindings/y', operationId: 'get_x' }),
    );
    expect(result).toEqual({
      code: 'BND-001',
      message: 'unbound required parameter',
      category: 'BINDING',
      sourcePointer: '#/tools/get_x/bindings/y',
      toolName: 'get_x',
    });
  });

  it('omits sourcePointer/toolName entirely when absent, rather than as undefined', () => {
    const result = diagnosticToProductError(diagnostic('IMP-002'));
    expect(result).not.toHaveProperty('sourcePointer');
    expect(result).not.toHaveProperty('toolName');
  });

  it('falls back to VALIDATION for an unrecognized prefix rather than throwing', () => {
    const result = diagnosticToProductError(diagnostic('ZZZ-999'));
    expect(result.category).toBe('VALIDATION');
  });
});
