import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { parseOpenApi } from './parse.js';
import { DEFAULT_FETCH_POLICY } from './remote-fetch/index.js';

const SOURCE_ID = 'src-1';

let server: Server | undefined;

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

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

  it('resolves a real remote $ref end to end — the full parseOpenApi pipeline, not just resolveRemoteReferences in isolation', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }));
    });

    const result = await parseOpenApi(
      {
        openapi: '3.1.0',
        info: { title: 'X', version: '1.0.0' },
        paths: {
          '/x': {
            get: {
              operationId: 'getX',
              responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: `${baseUrl}/pet.json` } } } } },
            },
          },
        },
      },
      { sourceId: SOURCE_ID, fetchPolicy: { ...DEFAULT_FETCH_POLICY, allowedSchemes: ['http'], allowPrivateNetworks: true } },
    );

    expect(result.diagnostics).toEqual([]);
    const schemaRef = result.value?.operations[0]?.responses[0]?.schema;
    expect(schemaRef?.kind).toBe('inline');
    if (schemaRef?.kind === 'inline') {
      expect(schemaRef.schema.schema).toMatchObject({ type: 'object', required: ['id'] });
    }
  });

  it('rejects a document whose remote $ref resolves to a blocked address — fatal, not a silently incomplete parse', async () => {
    const result = await parseOpenApi(
      {
        openapi: '3.1.0',
        info: { title: 'X', version: '1.0.0' },
        paths: {
          '/x': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: 'https://127.0.0.1/pet.json' } } } } } } },
        },
      },
      { sourceId: SOURCE_ID }, // default policy: private networks blocked
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === 'SEC-IMP-002')).toBe(true);
  });

  it('fetchPolicy: null disables remote resolution entirely — the $ref is left unresolved rather than fetched', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'object' }));
    });

    const result = await parseOpenApi(
      {
        openapi: '3.1.0',
        info: { title: 'X', version: '1.0.0' },
        paths: {
          '/x': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: `${baseUrl}/pet.json` } } } } } } },
        },
      },
      { sourceId: SOURCE_ID, fetchPolicy: null },
    );

    // Not fatal — an unresolved $ref left in place, same as the vendor-extension case above.
    expect(result.value).toBeDefined();
    const schemaRef = result.value?.operations[0]?.responses[0]?.schema;
    if (schemaRef?.kind === 'inline') {
      expect(schemaRef.schema.schema).toHaveProperty('$ref');
    }
  });
});
