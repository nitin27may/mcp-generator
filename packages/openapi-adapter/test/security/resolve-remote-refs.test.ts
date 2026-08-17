import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dereference } from '@scalar/openapi-parser';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FETCH_POLICY, type FetchPolicy } from '../../src/remote-fetch/fetch-policy.js';
import { resolveRemoteReferences } from '../../src/remote-fetch/resolve-remote-refs.js';

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

/** Local http:// + private-network policy so the test server (loopback, plain HTTP) is reachable. */
function localPolicy(overrides: Partial<FetchPolicy> = {}): FetchPolicy {
  return { ...DEFAULT_FETCH_POLICY, allowedSchemes: ['http'], allowPrivateNetworks: true, ...overrides };
}

describe('resolveRemoteReferences', () => {
  it('fetches a real external $ref, and the result dereferences cleanly (no $ref left) — proves the bundle -> dereference seam actually composes', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }));
    });

    const document = {
      openapi: '3.1.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { $ref: `${baseUrl}/pet.json` } } } },
            },
          },
        },
      },
    };

    const { document: bundled, diagnostics } = await resolveRemoteReferences(document, localPolicy());
    expect(diagnostics).toEqual([]);

    const dereferenced = dereference(bundled as never);
    expect(dereferenced.errors ?? []).toEqual([]);
    const schema = (dereferenced.schema as { paths: { '/x': { get: { responses: { '200': { content: { 'application/json': { schema: unknown } } } } } } } })
      .paths['/x'].get.responses['200'].content['application/json'].schema;
    expect(schema).not.toHaveProperty('$ref');
    expect(schema).toMatchObject({ type: 'object', required: ['id'] });
  });

  it('produces a fatal diagnostic (not a silent empty result) when a remote $ref resolves to a blocked address', async () => {
    const document = {
      openapi: '3.1.0',
      info: { title: 'X', version: '1' },
      paths: { '/x': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: 'https://127.0.0.1/pet.json' } } } } } } } },
    };

    // Default policy: HTTPS only, private networks blocked — 127.0.0.1 is blocked regardless of scheme.
    const { diagnostics } = await resolveRemoteReferences(document, DEFAULT_FETCH_POLICY);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'SEC-IMP-002' });
  });

  it('produces a warning diagnostic (not fatal) when a remote $ref genuinely fails to resolve (404)', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const document = {
      openapi: '3.1.0',
      info: { title: 'X', version: '1' },
      paths: { '/x': { get: { responses: { '200': { content: { 'application/json': { schema: { $ref: `${baseUrl}/missing.json` } } } } } } } },
    };

    const { diagnostics } = await resolveRemoteReferences(document, localPolicy());

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'VAL-001' });
  });

  it('refuses further fetches once maxReferences is exceeded', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'string' }));
    });
    const document = {
      openapi: '3.1.0',
      info: { title: 'X', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        a: { $ref: `${baseUrl}/a.json` },
                        b: { $ref: `${baseUrl}/b.json` },
                        c: { $ref: `${baseUrl}/c.json` },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const { diagnostics } = await resolveRemoteReferences(document, localPolicy({ maxReferences: 1 }));

    expect(diagnostics.some((d) => d.code === 'SEC-IMP-004')).toBe(true);
  });
});
