import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HttpRequestParts } from '@mcpgen/binding-engine';
import { afterEach, describe, expect, it } from 'vitest';
import { executeUpstreamRequest } from './execute.js';
import type { RetryPolicy } from './retry-policy.js';

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

// Small delays so the suite stays fast — behavior under test is attempt counting and eligibility, not real backoff timing.
const FAST_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 10, totalDeadlineMs: 5_000 };

describe('executeUpstreamRequest — retry (TIP §21)', () => {
  it('retries a transient 503 on a GET (retryable by default) and succeeds on the third attempt', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      if (calls < 3) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    const { result, diagnostics } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      retry: { risk: 'READ_ONLY' },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(diagnostics).toEqual([]);
    expect(result?.status).toBe(200);
    expect(result?.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('gives up after maxAttempts, returning the last (failing) response', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result, diagnostics } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      retry: { risk: 'READ_ONLY' },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(diagnostics).toEqual([]);
    expect(result?.status).toBe(503);
    expect(result?.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('never retries a POST by default, even on a transient 503', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor({ method: 'POST' }),
      retry: { risk: 'WRITE' },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(result?.status).toBe(503);
    expect(result?.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it('retries a POST when explicitly marked idempotent via retry.config.enabled', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      if (calls < 2) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor({ method: 'POST' }),
      retry: { risk: 'WRITE', config: { enabled: true } },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(result?.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('never retries a DESTRUCTIVE-risk operation even with retry.config.enabled: true (BR-006 hard floor)', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor({ method: 'DELETE' }),
      retry: { risk: 'DESTRUCTIVE', config: { enabled: true } },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(result?.status).toBe(503);
    expect(calls).toBe(1);
  });

  it('never retries a non-transient status (404) regardless of eligibility', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      retry: { risk: 'READ_ONLY' },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(result?.status).toBe(404);
    expect(calls).toBe(1);
  });

  it('does not retry at all when `retry` is omitted from the input (safest default)', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({ baseUrl, parts: partsFor(), retryPolicy: FAST_RETRY_POLICY });

    expect(result?.status).toBe(503);
    expect(result?.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it('a successful first attempt reports attempts: 1', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      retry: { risk: 'READ_ONLY' },
      retryPolicy: FAST_RETRY_POLICY,
    });

    expect(result?.attempts).toBe(1);
  });

  it('stops retrying once the total deadline would be exceeded', async () => {
    let calls = 0;
    const baseUrl = await startServer((_req, res) => {
      calls++;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const { result } = await executeUpstreamRequest({
      baseUrl,
      parts: partsFor(),
      retry: { risk: 'READ_ONLY' },
      // maxAttempts is high, but the deadline is tighter than even one backoff step would allow.
      retryPolicy: { maxAttempts: 10, baseDelayMs: 1_000, maxDelayMs: 5_000, totalDeadlineMs: 5 },
    });

    expect(result?.status).toBe(503);
    expect(calls).toBe(1);
  });
});
