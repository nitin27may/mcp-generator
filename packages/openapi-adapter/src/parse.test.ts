import { describe, expect, it } from 'vitest';
import { parseOpenApi } from './parse.js';

const SOURCE_ID = 'src-1';

describe('parseOpenApi', () => {
  it('parses a well-formed 3.1 document with no upgrade notice', async () => {
    const result = await parseOpenApi(
      { openapi: '3.1.0', info: { title: 'X', version: '1.0.0' }, paths: {} },
      { sourceId: SOURCE_ID },
    );
    expect(result.value).toBeDefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('accepts a Swagger 2.0 document, normalizing it to 3.1 with an IMP-006 notice', async () => {
    const result = await parseOpenApi(
      {
        swagger: '2.0',
        info: { title: 'Legacy Pet Store', version: '1.0.0' },
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['https'],
        securityDefinitions: { apiKeyAuth: { type: 'apiKey', name: 'X-API-Key', in: 'header' } },
        paths: {
          '/pets/{id}': {
            get: {
              operationId: 'getPet',
              parameters: [{ name: 'id', in: 'path', required: true, type: 'string' }],
              responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/Pet' } } },
            },
          },
        },
        definitions: {
          Pet: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } },
        },
      },
      { sourceId: SOURCE_ID },
    );

    expect(result.value).toBeDefined();
    expect(result.value?.servers).toEqual([{ url: 'https://api.example.com/v2' }]);
    expect(result.value?.securitySchemes).toEqual([{ name: 'apiKeyAuth', type: 'apiKey', in: 'header', paramName: 'X-API-Key' }]);
    expect(result.value?.operations).toHaveLength(1);
    expect(result.value?.operations[0]?.responses[0]?.schema).toBeDefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'IMP-006', message: expect.stringContaining('Swagger 2.0') }),
    );
  });

  it('accepts an OAS 3.0 document, normalizing `nullable` to a 2020-12 type union with an IMP-006 notice', async () => {
    const result = await parseOpenApi(
      {
        openapi: '3.0.3',
        info: { title: 'X', version: '1.0.0' },
        paths: {
          '/x': {
            get: {
              operationId: 'getX',
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { type: 'object', nullable: true, properties: { a: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { sourceId: SOURCE_ID },
    );

    expect(result.value).toBeDefined();
    const schemaRef = result.value?.operations[0]?.responses[0]?.schema;
    expect(schemaRef?.kind).toBe('inline');
    if (schemaRef?.kind === 'inline') {
      expect(schemaRef.schema.schema).toMatchObject({ type: ['object', 'null'] });
    }
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'IMP-006', message: expect.stringContaining('OpenAPI 3.0') }),
    );
  });

  it('rejects OAS 3.2 — real-world adoption is negligible and upgrade() only targets 3.1 (TIP §2 row 12)', async () => {
    const result = await parseOpenApi(
      { openapi: '3.2.0', info: { title: 'X', version: '1.0.0' }, paths: {} },
      { sourceId: SOURCE_ID },
    );
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('IMP-001');
  });

  it('rejects a document with no detectable OpenAPI version', async () => {
    const result = await parseOpenApi(null, { sourceId: SOURCE_ID });
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('IMP-001');
  });

  it('imports a document with an unresolvable external $ref inside a vendor x-* extension, downgraded to a warning', async () => {
    // Mirrors a real-world spec (Bump.sh's Train Travel API) using `x-topics` to embed a
    // $ref to an external markdown file — content outside the operative API surface.
    const result = await parseOpenApi(
      {
        openapi: '3.1.0',
        info: { title: 'X', version: '1.0.0' },
        'x-topics': [{ title: 'Getting started', content: { $ref: './docs/getting-started.md' } }],
        paths: {
          '/x': { get: { responses: { '200': { description: 'ok' } } } },
        },
      },
      { sourceId: SOURCE_ID },
    );

    expect(result.value).toBeDefined();
    expect(result.value?.operations).toHaveLength(1);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });
});
