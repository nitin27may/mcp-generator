import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FETCH_POLICY, type FetchPolicy } from '../../src/remote-fetch/fetch-policy.js';
import { createSafeFetch } from '../../src/remote-fetch/safe-fetch.js';

let server: Server | undefined;

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

/** Local http:// + private-network policy — the local test server is plain HTTP on a loopback address, so tests exercising a real round trip need both opt-ins. */
function localPolicy(overrides: Partial<FetchPolicy> = {}): FetchPolicy {
  return { ...DEFAULT_FETCH_POLICY, allowedSchemes: ['http'], allowPrivateNetworks: true, ...overrides };
}

describe('createSafeFetch — scheme allowlist', () => {
  it('blocks a scheme not in allowedSchemes without attempting a connection', async () => {
    const { fetch: safeFetch } = createSafeFetch(DEFAULT_FETCH_POLICY); // https only
    await expect(safeFetch('http://127.0.0.1:1/never-reached')).rejects.toMatchObject({ code: 'SEC-IMP-001' });
  });
});

describe('createSafeFetch — private/loopback address blocking (default policy)', () => {
  it('blocks a literal loopback IP by default', async () => {
    const baseUrl = await startServer((_req, res) => res.end('ok'));
    const { fetch: safeFetch } = createSafeFetch({ ...DEFAULT_FETCH_POLICY, allowedSchemes: ['http'] });
    await expect(safeFetch(baseUrl)).rejects.toMatchObject({ code: 'SEC-IMP-002' });
  });

  it('blocks the "localhost" hostname by default', async () => {
    const { fetch: safeFetch } = createSafeFetch({ ...DEFAULT_FETCH_POLICY, allowedSchemes: ['http'] });
    await expect(safeFetch('http://localhost:1/x')).rejects.toMatchObject({ code: 'SEC-IMP-002' });
  });

  it('blocks a hostname that resolves (via DNS) to a private address', async () => {
    vi.doMock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '10.0.0.5', family: 4 }]) }));
    vi.resetModules();
    const { createSafeFetch: freshCreateSafeFetch } = await import('../../src/remote-fetch/safe-fetch.js');
    const { fetch: safeFetch } = freshCreateSafeFetch({ ...DEFAULT_FETCH_POLICY, allowedSchemes: ['http'] });
    await expect(safeFetch('http://internal.example.test/x')).rejects.toMatchObject({ code: 'SEC-IMP-002' });
    vi.doUnmock('node:dns/promises');
    vi.resetModules();
  });

  it('allows a private/loopback address when allowPrivateNetworks is explicitly true', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    });
    const { fetch: safeFetch } = createSafeFetch(localPolicy());
    const response = await safeFetch(baseUrl);
    expect(await response.text()).toBe('hello');
  });
});

describe('createSafeFetch — redirects', () => {
  it('follows a redirect, re-validating the new hop, and returns the final content', async () => {
    const baseUrl = await startServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('final content');
    });
    const { fetch: safeFetch } = createSafeFetch(localPolicy());
    const response = await safeFetch(`${baseUrl}/start`);
    expect(await response.text()).toBe('final content');
  });

  it('refuses once maxRedirects is exceeded', async () => {
    const baseUrl = await startServer((req, res) => {
      const n = Number(req.url?.slice(1) ?? '0');
      res.writeHead(302, { location: `/${n + 1}` });
      res.end();
    });
    const { fetch: safeFetch } = createSafeFetch(localPolicy({ maxRedirects: 2 }));
    await expect(safeFetch(`${baseUrl}/0`)).rejects.toMatchObject({ code: 'SEC-IMP-003' });
  });

  it('refuses a redirect that downgrades from https to http', async () => {
    // No real TLS server locally — mock the global fetch this layer calls internally to
    // return a real 302 pointing at an http:// Location, and assert the downgrade is refused
    // before any connection to that target is attempted. An IP literal for the start URL
    // skips DNS entirely, keeping this test fully offline.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://198.51.100.7/schema.json' } }),
    );
    const { fetch: safeFetch } = createSafeFetch({ ...DEFAULT_FETCH_POLICY, allowedSchemes: ['https', 'http'] });
    await expect(safeFetch('https://93.184.216.34/schema.json')).rejects.toMatchObject({ code: 'SEC-IMP-001' });
  });
});

describe('createSafeFetch — byte limits', () => {
  it('refuses a response exceeding maxDocumentBytes', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(1000));
    });
    const { fetch: safeFetch } = createSafeFetch(localPolicy({ maxDocumentBytes: 100 }));
    await expect(safeFetch(baseUrl)).rejects.toMatchObject({ code: 'SEC-IMP-003' });
  });

  it('tracks cumulative bytes across multiple calls through one instance and refuses once the total budget is exceeded', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(60));
    });
    const { fetch: safeFetch, totalBytesFetched } = createSafeFetch(localPolicy({ maxDocumentBytes: 1000, maxTotalBytes: 100 }));
    await safeFetch(baseUrl);
    expect(totalBytesFetched()).toBe(60);
    await expect(safeFetch(baseUrl)).rejects.toMatchObject({ code: 'SEC-IMP-003' });
  });
});

describe('createSafeFetch — timeout', () => {
  it('times out against a slow upstream', async () => {
    const baseUrl = await startServer((_req, res) => {
      setTimeout(() => res.end('too late'), 500);
    });
    const { fetch: safeFetch } = createSafeFetch(localPolicy({ timeoutMs: 20 }));
    await expect(safeFetch(baseUrl)).rejects.toMatchObject({ code: 'SEC-IMP-005' });
  });
});
