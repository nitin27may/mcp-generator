import type { CanonicalApi, CanonicalOperation, CanonicalParameter, CanonicalSchemaRef } from '@mcpgen/domain';

/**
 * Test builders deliberately accept explicit `undefined` for optional
 * fields ("no summary" reads better than omitting the key), which
 * `Partial<T>` alone forbids under `exactOptionalPropertyTypes`.
 */
type Overrides<T> = { [K in keyof T]?: T[K] | undefined };

export function schemaRef(schema: Record<string, unknown>): CanonicalSchemaRef {
  return { kind: 'inline', schema: { kind: 'json-schema', dialect: '2020-12', schema, sourceDialect: 'json-schema-2020-12', warnings: [] } };
}

export function param(overrides: Overrides<CanonicalParameter> & { sourceName: string }): CanonicalParameter {
  const base = {
    id: `query:${overrides.sourceName}`,
    location: 'query' as const,
    required: false,
    schema: schemaRef({ type: 'string' }),
  };
  return Object.fromEntries(Object.entries({ ...base, ...overrides }).filter(([, v]) => v !== undefined)) as unknown as CanonicalParameter;
}

export function op(overrides: Overrides<CanonicalOperation> = {}): CanonicalOperation {
  const base = {
    id: overrides.operationId ?? 'op',
    sourcePointer: '#/paths/x/get',
    method: 'GET' as const,
    path: '/x',
    tags: [] as string[],
    deprecated: false,
    parameters: [] as CanonicalParameter[],
    responses: [] as CanonicalOperation['responses'],
    security: [{ schemeName: 'bearerAuth', scopes: [] }] as CanonicalOperation['security'],
    sourceFingerprint: 'fp',
  };
  return Object.fromEntries(Object.entries({ ...base, ...overrides }).filter(([, v]) => v !== undefined)) as unknown as CanonicalOperation;
}

export function api(operations: CanonicalOperation[], overrides: Partial<CanonicalApi> = {}): CanonicalApi {
  return {
    schemaVersion: '1.0',
    source: { id: 's', rawFingerprint: 'fp' },
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    securitySchemes: [{ name: 'bearerAuth', type: 'http', scheme: 'bearer' }],
    operations,
    schemas: {},
    diagnostics: [],
    ...overrides,
  };
}
