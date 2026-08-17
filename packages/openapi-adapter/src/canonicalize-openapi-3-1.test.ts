import { describe, expect, it } from 'vitest';
import { canonicalizeOpenApi31 } from './canonicalize-openapi-3-1.js';

const SOURCE = { id: 'src-1', rawFingerprint: 'fp-1' };

describe('canonicalizeOpenApi31', () => {
  it('maps info, servers, and security schemes', () => {
    const api = canonicalizeOpenApi31(
      {
        info: { title: 'X', version: '1.0.0', description: 'd' },
        servers: [{ url: 'https://api.example.com', description: 'prod' }],
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        },
        paths: {},
      },
      SOURCE,
    );

    expect(api.info).toEqual({ title: 'X', version: '1.0.0', description: 'd' });
    expect(api.servers).toEqual([{ url: 'https://api.example.com', description: 'prod' }]);
    expect(api.securitySchemes).toEqual([{ name: 'bearerAuth', type: 'http', scheme: 'bearer' }]);
  });

  it('falls back to method + normalized path when operationId is absent', () => {
    const api = canonicalizeOpenApi31(
      { info: {}, paths: { '/customers/{id}': { get: { responses: {} } } } },
      SOURCE,
    );
    expect(api.operations[0]?.id).toBe('GET:/customers/{}');
    expect(api.operations[0]?.operationId).toBeUndefined();
  });

  it('uses operationId as the identity when present', () => {
    const api = canonicalizeOpenApi31(
      { info: {}, paths: { '/x': { get: { operationId: 'getX', responses: {} } } } },
      SOURCE,
    );
    expect(api.operations[0]?.id).toBe('getX');
  });

  it('maps parameter location, required, and schema', () => {
    const api = canonicalizeOpenApi31(
      {
        info: {},
        paths: {
          '/x/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'expand', in: 'query', required: false, schema: { type: 'string' } },
              ],
              responses: {},
            },
          },
        },
      },
      SOURCE,
    );
    const [pathParam, queryParam] = api.operations[0]!.parameters;
    expect(pathParam).toMatchObject({ sourceName: 'id', location: 'path', required: true });
    expect(queryParam).toMatchObject({ sourceName: 'expand', location: 'query', required: false });
  });

  it('picks application/json when multiple content types are present', () => {
    const api = canonicalizeOpenApi31(
      {
        info: {},
        paths: {
          '/x': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'text/plain': { schema: { type: 'string' } },
                  'application/json': { schema: { type: 'object' } },
                },
              },
              responses: {},
            },
          },
        },
      },
      SOURCE,
    );
    expect(api.operations[0]?.requestBody?.contentType).toBe('application/json');
  });

  it('maps responses keyed by status code', () => {
    const api = canonicalizeOpenApi31(
      {
        info: {},
        paths: {
          '/x': {
            get: {
              responses: {
                '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
                '404': { description: 'Not found' },
              },
            },
          },
        },
      },
      SOURCE,
    );
    expect(api.operations[0]?.responses.map((r) => r.statusCode)).toEqual(['200', '404']);
    expect(api.operations[0]?.responses[1]?.schema).toBeUndefined();
  });

  it('marks deprecated operations', () => {
    const api = canonicalizeOpenApi31(
      { info: {}, paths: { '/x': { get: { deprecated: true, responses: {} } } } },
      SOURCE,
    );
    expect(api.operations[0]?.deprecated).toBe(true);
  });

  it('defaults deprecated to false when absent', () => {
    const api = canonicalizeOpenApi31({ info: {}, paths: { '/x': { get: { responses: {} } } } }, SOURCE);
    expect(api.operations[0]?.deprecated).toBe(false);
  });

  describe('security inheritance', () => {
    it('inherits document-level security when the operation omits the field', () => {
      const api = canonicalizeOpenApi31(
        {
          info: {},
          security: [{ bearerAuth: [] }],
          paths: { '/x': { get: { responses: {} } } },
        },
        SOURCE,
      );
      expect(api.operations[0]?.security).toEqual([{ schemeName: 'bearerAuth', scopes: [] }]);
    });

    it('an explicit empty array on the operation overrides document-level security to "none"', () => {
      const api = canonicalizeOpenApi31(
        {
          info: {},
          security: [{ bearerAuth: [] }],
          paths: { '/x': { get: { security: [], responses: {} } } },
        },
        SOURCE,
      );
      expect(api.operations[0]?.security).toEqual([]);
    });

    it('an explicit operation-level scheme overrides the document default entirely', () => {
      const api = canonicalizeOpenApi31(
        {
          info: {},
          security: [{ bearerAuth: [] }],
          paths: { '/x': { get: { security: [{ apiKeyAuth: [] }], responses: {} } } },
        },
        SOURCE,
      );
      expect(api.operations[0]?.security).toEqual([{ schemeName: 'apiKeyAuth', scopes: [] }]);
    });
  });

  it('every operation carries a non-empty, content-derived sourceFingerprint', () => {
    const api = canonicalizeOpenApi31(
      {
        info: {},
        paths: {
          '/a': { get: { operationId: 'a', responses: {} } },
          '/b': { get: { operationId: 'b', responses: {} } },
        },
      },
      SOURCE,
    );
    const [a, b] = api.operations;
    expect(a?.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a?.sourceFingerprint).not.toBe(b?.sourceFingerprint);
  });
});
