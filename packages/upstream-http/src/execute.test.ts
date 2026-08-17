import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HttpRequestParts } from '@mcpgen/binding-engine';
import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { executeUpstreamRequest } from './execute.js';

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

function partsFor(overrides: Partial<HttpRequestParts> = {}): HttpRequestParts {
  return { method: 'GET', path: '/x', query: new URLSearchParams(), headers: {}, ...overrides };
}

describe('executeUpstreamRequest — real request/response round trip', () => {
  it('performs a GET with query params and parses a JSON response', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/customers?page=2');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'c-1', name: 'Ada' }));
    });

    const parts = partsFor({ path: '/customers', query: new URLSearchParams({ page: '2' }) });
    const { result, diagnostics } = await executeUpstreamRequest({ baseUrl, parts });

    expect(diagnostics).toEqual([]);
    expect(result?.status).toBe(200);
    expect(result?.body).toEqual({ id: 'c-1', name: 'Ada' });
  });

  it('sends a POST with a JSON body and Content-Type header', async () => {
    const baseUrl = await startServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        expect(req.headers['content-type']).toBe('application/json');
        expect(JSON.parse(raw)).toEqual({ name: 'Ada', email: 'ada@example.com' });
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'c-1' }));
      });
    });

    const parts = partsFor({ method: 'POST', path: '/customers', body: { name: 'Ada', email: 'ada@example.com' } });
    const { result, diagnostics } = await executeUpstreamRequest({ baseUrl, parts });

    expect(diagnostics).toEqual([]);
    expect(result?.status).toBe(201);
  });

  it('attaches bearer auth as an Authorization header the server actually receives', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.headers.authorization).toBe('Bearer sk-live-token');
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });

    const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'TOKEN' } };
    const { diagnostics } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      auth: { config: auth, resolvedValues: { token: 'sk-live-token' } },
    });
    expect(diagnostics).toEqual([]);
  });

  it('never sends a request when auth resolution failed — fails closed', async () => {
    let called = false;
    const baseUrl = await startServer((_req, res) => {
      called = true;
      res.writeHead(200);
      res.end();
    });

    const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'TOKEN' } };
    const { result, diagnostics } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      auth: { config: auth, resolvedValues: {} }, // token never resolved
    });

    expect(called).toBe(false);
    expect(result).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ code: 'AUT-001' });
  });

  it('falls back to raw text when the server claims JSON but sends malformed JSON', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{not valid json');
    });
    const { result, diagnostics } = await executeUpstreamRequest({ baseUrl, parts: partsFor() });
    expect(diagnostics).toEqual([]);
    expect(result?.body).toBe('{not valid json');
  });

  it('returns non-2xx responses as a normal result — status interpretation is not this layer\'s job', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    const { result, diagnostics } = await executeUpstreamRequest({ baseUrl, parts: partsFor() });
    expect(diagnostics).toEqual([]);
    expect(result?.status).toBe(404);
    expect(result?.body).toEqual({ error: 'not found' });
  });
});

describe('executeUpstreamRequest — timeout', () => {
  it('produces UPS-001 when the upstream does not respond in time', async () => {
    const baseUrl = await startServer((_req, res) => {
      setTimeout(() => res.end('too late'), 500);
    });
    const { result, diagnostics } = await executeUpstreamRequest({ baseUrl, parts: partsFor(), timeoutMs: 50 });
    expect(result).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'UPS-001' });
    expect(diagnostics[0]?.message).toContain('50ms');
  });
});

describe('executeUpstreamRequest — network failure', () => {
  it('produces UPS-000 for a connection that is refused outright', async () => {
    // Nothing is listening on this port.
    const { result, diagnostics } = await executeUpstreamRequest({
      baseUrl: 'http://127.0.0.1:1',
      parts: partsFor(),
      timeoutMs: 2_000,
    });
    expect(result).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'UPS-000' });
  });
});

describe('executeUpstreamRequest — response limits (TIP §23)', () => {
  it('rejects an oversized response without returning a truncated body', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(100));
    });
    const { result, diagnostics } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      responsePolicy: { maxBytes: 10, allowedContentTypes: ['text/plain'] },
    });
    expect(result).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'UPS-003' });
  });

  it('rejects a disallowed content type', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('binary-ish');
    });
    const { result, diagnostics } = await executeUpstreamRequest({ baseUrl, parts: partsFor() });
    expect(result).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'UPS-004' });
  });
});

describe('executeUpstreamRequest — secret leakage in diagnostics', () => {
  it('never includes the query string (and therefore never an apiKey-in-query secret) in a failure diagnostic', async () => {
    const auth: UpstreamAuthentication = { type: 'apiKey', in: 'query', name: 'api_key', value: { source: 'secret', name: 'K' } };
    const { diagnostics } = await executeUpstreamRequest({
      baseUrl: 'http://127.0.0.1:1', // nothing listening -> network failure path
      parts: partsFor(),
      auth: { config: auth, resolvedValues: { value: 'sk-super-secret-sentinel' } },
      timeoutMs: 2_000,
    });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('sk-super-secret-sentinel');
  });
});
