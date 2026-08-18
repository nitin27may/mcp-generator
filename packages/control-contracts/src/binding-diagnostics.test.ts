import type { ValueBinding } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { computeBindingDiagnostics } from './binding-diagnostics.js';
import type { OperationDetail } from './project.js';

function detail(overrides: Partial<OperationDetail> = {}): OperationDetail {
  return {
    id: 'op1',
    method: 'POST',
    path: '/widgets/{widgetId}',
    parameters: [
      { id: 'p1', sourceName: 'widgetId', location: 'path', required: true, schema: { type: 'string' } },
      { id: 'p2', sourceName: 'verbose', location: 'query', required: false, schema: { type: 'boolean' } },
    ],
    responses: [],
    schemaBudget: { withinBudget: true, violations: [] },
    headerAnnotations: [],
    ...overrides,
  };
}

describe('computeBindingDiagnostics', () => {
  it('flags a required parameter with no binding entry at all', () => {
    const errors = computeBindingDiagnostics(detail(), {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'BND-001', category: 'BINDING' });
    expect(errors[0]!.message).toContain('widgetId');
  });

  it('does not flag an optional parameter left unbound', () => {
    const bindings: Record<string, ValueBinding> = { widgetId: { source: 'tool-input', inputName: 'widget_id' } };
    const errors = computeBindingDiagnostics(detail(), bindings);
    expect(errors).toEqual([]);
  });

  it('accepts any binding kind as satisfying the requirement — this check is presence-only, not value-resolvability', () => {
    const bindings: Record<string, ValueBinding> = { widgetId: { source: 'static', value: 'fixed-id' } };
    expect(computeBindingDiagnostics(detail(), bindings)).toEqual([]);
  });

  it('flags a required request-body property with no binding', () => {
    const withBody = detail({
      requestBody: { required: true, contentType: 'application/json', schema: {}, properties: ['name', 'quantity'], requiredProperties: ['name'] },
    });
    const bindings: Record<string, ValueBinding> = { widgetId: { source: 'tool-input', inputName: 'widget_id' } };
    const errors = computeBindingDiagnostics(withBody, bindings);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('name');
  });

  it('returns no errors when every required field is bound', () => {
    const withBody = detail({
      requestBody: { required: true, contentType: 'application/json', schema: {}, properties: ['name'], requiredProperties: ['name'] },
    });
    const bindings: Record<string, ValueBinding> = {
      widgetId: { source: 'tool-input', inputName: 'widget_id' },
      name: { source: 'tool-input', inputName: 'name' },
    };
    expect(computeBindingDiagnostics(withBody, bindings)).toEqual([]);
  });
});
