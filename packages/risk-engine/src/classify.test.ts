import { describe, expect, it } from 'vitest';
import type { CanonicalApi } from '@mcpgen/domain';
import { classifyApi, classifyOperation } from './classify.js';
import { op } from './test-helpers.js';

describe('classifyOperation', () => {
  it('classifies an admin-shaped GET as PRIVILEGED, ahead of the method-based READ_ONLY rule', () => {
    const result = classifyOperation(op({ method: 'GET', path: '/admin/users/{id}/roles' }));
    expect(result.classification).toBe('PRIVILEGED');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain('/admin/users/{id}/roles');
  });

  it('classifies a permission-shaped path as PRIVILEGED', () => {
    const result = classifyOperation(op({ method: 'POST', path: '/users/{id}/permissions' }));
    expect(result.classification).toBe('PRIVILEGED');
  });

  it('classifies DELETE as DESTRUCTIVE regardless of path shape', () => {
    const result = classifyOperation(op({ method: 'DELETE', path: '/customers/{id}' }));
    expect(result.classification).toBe('DESTRUCTIVE');
    expect(result.confidence).toBe(0.9);
  });

  it('classifies POST with a destructive-action-shaped path as DESTRUCTIVE', () => {
    const result = classifyOperation(op({ method: 'POST', path: '/subscriptions/{id}/cancel' }));
    expect(result.classification).toBe('DESTRUCTIVE');
  });

  it('classifies PATCH with a bulk-shaped path as DESTRUCTIVE', () => {
    const result = classifyOperation(op({ method: 'PATCH', path: '/orders/bulk-update' }));
    expect(result.classification).toBe('DESTRUCTIVE');
  });

  it('classifies a plain GET as READ_ONLY', () => {
    const result = classifyOperation(op({ method: 'GET', path: '/customers/{id}' }));
    expect(result.classification).toBe('READ_ONLY');
    expect(result.confidence).toBe(0.85);
  });

  it('classifies HEAD as READ_ONLY', () => {
    const result = classifyOperation(op({ method: 'HEAD', path: '/customers/{id}' }));
    expect(result.classification).toBe('READ_ONLY');
  });

  it('classifies a search-shaped POST as READ_ONLY despite the mutating method', () => {
    const result = classifyOperation(op({ method: 'POST', path: '/customers/search' }));
    expect(result.classification).toBe('READ_ONLY');
    expect(result.confidence).toBe(0.6);
  });

  it('classifies a plain POST with no destructive/bulk/search signal as WRITE', () => {
    const result = classifyOperation(op({ method: 'POST', path: '/customers' }));
    expect(result.classification).toBe('WRITE');
  });

  it('classifies PUT with no destructive/bulk signal as WRITE', () => {
    const result = classifyOperation(op({ method: 'PUT', path: '/customers/{id}' }));
    expect(result.classification).toBe('WRITE');
  });

  it('falls back to UNKNOWN for methods with no known risk pattern', () => {
    const result = classifyOperation(op({ method: 'OPTIONS', path: '/customers' }));
    expect(result.classification).toBe('UNKNOWN');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('includes operationId in the classification signal, not just the path', () => {
    const result = classifyOperation(op({ method: 'POST', path: '/x/{id}', operationId: 'purge-cache' }));
    expect(result.classification).toBe('DESTRUCTIVE');
  });
});

function api(operations: CanonicalApi['operations']): CanonicalApi {
  return {
    schemaVersion: '1.0',
    source: { id: 'src', rawFingerprint: 'fp' },
    info: { title: 'Test API', version: '1.0.0' },
    servers: [],
    securitySchemes: [],
    operations,
    schemas: {},
    diagnostics: [],
  };
}

describe('classifyApi', () => {
  it('classifies every operation in the API, keyed by operation id', () => {
    const result = classifyApi(
      api([
        op({ id: 'getCustomer', method: 'GET', path: '/customers/{id}' }),
        op({ id: 'deleteCustomer', method: 'DELETE', path: '/customers/{id}' }),
      ]),
    );

    expect(Object.keys(result)).toEqual(['getCustomer', 'deleteCustomer']);
    expect(result['getCustomer']?.classification).toBe('READ_ONLY');
    expect(result['deleteCustomer']?.classification).toBe('DESTRUCTIVE');
  });

  it('returns an empty record for an API with no operations', () => {
    expect(classifyApi(api([]))).toEqual({});
  });
});
