import type { CanonicalOperation } from '@mcpgen/domain';
import { describe, expect, it } from 'vitest';
import { buildHttpRequestParts } from './build-request.js';

function op(overrides: Partial<CanonicalOperation> = {}): CanonicalOperation {
  return {
    id: 'op',
    sourcePointer: '#/paths/x/get',
    method: 'GET',
    path: '/x',
    tags: [],
    deprecated: false,
    parameters: [],
    responses: [],
    security: [],
    sourceFingerprint: 'fp',
    ...overrides,
  };
}

const stringSchemaRef = { kind: 'inline' as const, schema: { kind: 'json-schema' as const, dialect: '2020-12' as const, schema: { type: 'string' }, sourceDialect: 'json-schema-2020-12' as const, warnings: [] } };

function param(sourceName: string, location: 'path' | 'query' | 'header' | 'cookie', required = false) {
  return { id: `${location}:${sourceName}`, sourceName, location, required, schema: stringSchemaRef };
}

describe('buildHttpRequestParts — path parameters', () => {
  it('substitutes a path placeholder with the resolved value', () => {
    const { parts, diagnostics } = buildHttpRequestParts(
      op({ path: '/customers/{customerId}', parameters: [param('customerId', 'path', true)] }),
      { customerId: 'c-42' },
    );
    expect(parts.path).toBe('/customers/c-42');
    expect(diagnostics).toEqual([]);
  });

  it('percent-encodes a value containing characters unsafe for a path segment', () => {
    // A slash in the value must not be interpreted as introducing a new
    // path segment.
    const { parts } = buildHttpRequestParts(
      op({ path: '/customers/{customerId}', parameters: [param('customerId', 'path', true)] }),
      { customerId: 'a/b c' },
    );
    expect(parts.path).toBe('/customers/a%2Fb%20c');
  });

  it('produces BND-001 when a required path parameter has no resolved value', () => {
    const { diagnostics } = buildHttpRequestParts(
      op({ path: '/customers/{customerId}', parameters: [param('customerId', 'path', true)] }),
      {},
    );
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'BND-001' });
  });

  it('flags a path parameter whose placeholder is missing from the path template', () => {
    const { diagnostics } = buildHttpRequestParts(
      op({ path: '/customers', parameters: [param('customerId', 'path', true)] }),
      { customerId: 'c-1' },
    );
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'BND-001' });
    expect(diagnostics[0]?.message).toContain('no matching');
  });
});

describe('buildHttpRequestParts — query parameters', () => {
  it('appends resolved query parameters', () => {
    const { parts } = buildHttpRequestParts(
      op({ parameters: [param('page', 'query'), param('pageSize', 'query')] }),
      { page: '2', pageSize: '25' },
    );
    expect(parts.query.get('page')).toBe('2');
    expect(parts.query.get('pageSize')).toBe('25');
  });

  it('omits an optional query parameter that has no resolved value, without error', () => {
    const { parts, diagnostics } = buildHttpRequestParts(op({ parameters: [param('expand', 'query')] }), {});
    expect(parts.query.has('expand')).toBe(false);
    expect(diagnostics).toEqual([]);
  });

  it('lets URLSearchParams handle query value encoding', () => {
    const { parts } = buildHttpRequestParts(op({ parameters: [param('q', 'query')] }), { q: 'a b&c' });
    expect(parts.query.toString()).toBe('q=a+b%26c');
  });
});

describe('buildHttpRequestParts — header parameters', () => {
  it('places resolved header parameters into headers', () => {
    const { parts } = buildHttpRequestParts(op({ parameters: [param('X-Tenant', 'header')] }), {
      'X-Tenant': 'acme',
    });
    expect(parts.headers['X-Tenant']).toBe('acme');
  });

  it('refuses to build a request when a header value contains a CRLF (header injection guard)', () => {
    const { parts, diagnostics } = buildHttpRequestParts(op({ parameters: [param('X-Tenant', 'header')] }), {
      'X-Tenant': 'acme\r\nX-Injected: evil',
    });
    expect(parts.headers['X-Tenant']).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'SEC-005' });
  });

  it('rejects a bare LF the same as CRLF', () => {
    const { diagnostics } = buildHttpRequestParts(op({ parameters: [param('X-Tenant', 'header')] }), {
      'X-Tenant': 'acme\nX-Injected: evil',
    });
    expect(diagnostics[0]?.code).toBe('SEC-005');
  });
});

describe('buildHttpRequestParts — cookie parameters', () => {
  it('joins multiple cookie parameters into a single Cookie header', () => {
    const { parts } = buildHttpRequestParts(
      op({ parameters: [param('session', 'cookie'), param('theme', 'cookie')] }),
      { session: 's-1', theme: 'dark' },
    );
    expect(parts.headers['Cookie']).toBe('session=s-1; theme=dark');
  });
});

describe('buildHttpRequestParts — request body', () => {
  const withBody = { required: true, contentType: 'application/json', schema: stringSchemaRef };

  it('assembles unclaimed bindings into the body for a POST', () => {
    const { parts, diagnostics } = buildHttpRequestParts(op({ method: 'POST', requestBody: withBody }), {
      name: 'Ada',
      email: 'ada@example.com',
    });
    expect(parts.body).toEqual({ name: 'Ada', email: 'ada@example.com' });
    expect(diagnostics).toEqual([]);
  });

  it('does not place a path/query/header-claimed value into the body', () => {
    const { parts } = buildHttpRequestParts(
      op({
        method: 'POST',
        path: '/customers/{customerId}',
        parameters: [param('customerId', 'path', true)],
        requestBody: withBody,
      }),
      { customerId: 'c-1', name: 'Ada' },
    );
    expect(parts.body).toEqual({ name: 'Ada' });
    expect(parts.path).toBe('/customers/c-1');
  });

  it('produces BND-001 when the body is required but no bindings target it', () => {
    const { parts, diagnostics } = buildHttpRequestParts(op({ method: 'POST', requestBody: withBody }), {});
    expect(parts.body).toEqual({});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'BND-001' });
  });

  it('does not include a body key at all when the operation has no requestBody', () => {
    const { parts } = buildHttpRequestParts(op(), {});
    expect(parts.body).toBeUndefined();
  });
});

describe('buildHttpRequestParts — orphan bindings', () => {
  it('warns (BND-002) when a resolved value matches no parameter and there is no body to receive it', () => {
    const { diagnostics } = buildHttpRequestParts(op({ parameters: [] }), { typo: 'value' });
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'BND-002' });
  });
});

describe('buildHttpRequestParts — the P0 fixture end to end', () => {
  it('assembles the exact request shape for getCustomer', () => {
    const { parts, diagnostics } = buildHttpRequestParts(
      op({
        method: 'GET',
        path: '/customers/{customerId}',
        parameters: [param('customerId', 'path', true), param('expand', 'query')],
      }),
      { customerId: 'c-42', expand: 'orders' },
    );
    expect(diagnostics).toEqual([]);
    expect(parts).toMatchObject({ method: 'GET', path: '/customers/c-42' });
    expect(parts.query.get('expand')).toBe('orders');
  });
});
