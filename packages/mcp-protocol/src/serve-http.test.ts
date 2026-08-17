import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { serveToolsOverHttp, type McpHttpServerHandle } from './serve-http.js';
import type { ProtocolTool } from './protocol-tool.js';

const echoTool: ProtocolTool = {
  name: 'echo',
  description: 'Echoes its input',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message'],
    additionalProperties: false,
  },
  execute: async (args) => ({ content: [{ type: 'text', text: String(args.message) }], resultType: 'complete' }),
};

let handle: McpHttpServerHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

/** _meta envelope every modern (2026-07-28) request must carry. */
function meta() {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'http-test', version: '1.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

/**
 * A real MCP HTTP client transport adds these automatically (TIP §92.2); a
 * hand-constructed request has to add them itself, or the server correctly
 * rejects it with -32020 HeaderMismatch — confirmed by running this test
 * WITHOUT the headers first and observing exactly that rejection.
 */
function mcpHeaders(rpcBody: Record<string, unknown>): Record<string, string> {
  const params = rpcBody.params as Record<string, unknown> | undefined;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': String(rpcBody.method),
  };
  const name = params?.name;
  if (typeof name === 'string') headers['Mcp-Name'] = name;
  return headers;
}

async function postRpc(url: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { ...mcpHeaders(body), ...extraHeaders }, body: JSON.stringify(body) });
}

async function jsonBody(res: Response): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  return res.json() as Promise<{ result?: Record<string, unknown>; error?: unknown }>;
}

describe('serveToolsOverHttp — binds and endpoints (TIP §26.2/§26.3)', () => {
  it('binds to 127.0.0.1 by default and exposes the /mcp endpoint in its URL', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });

  it('serves /health and /ready outside the MCP endpoint', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const base = handle.url.replace(/\/mcp$/, '');

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await jsonBody(health)).toEqual({ status: 'ok' });

    const ready = await fetch(`${base}/ready`);
    expect(ready.status).toBe(200);
  });

  it('returns 404 for any path other than /mcp, /health, /ready', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const base = handle.url.replace(/\/mcp$/, '');
    const res = await fetch(`${base}/nonsense`);
    expect(res.status).toBe(404);
  });
});

describe('serveToolsOverHttp — MCP protocol over real HTTP', () => {
  it('server/discover confirms the modern 2026-07-28 revision', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await postRpc(handle.url, { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } });
    const body = await jsonBody(res);
    expect(body.result?.supportedVersions).toContain('2026-07-28');
  });

  it('tools/list publishes the registered tool', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await postRpc(handle.url, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } });
    const body = await jsonBody(res);
    const tools = body.result?.tools as { name: string }[] | undefined;
    expect(tools).toHaveLength(1);
    expect(tools?.[0]?.name).toBe('echo');
  });

  it('tools/call invokes execute() and returns its result', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await postRpc(handle.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'echo', arguments: { message: 'hello' }, _meta: meta() },
    });
    const body = await jsonBody(res);
    expect(body.result?.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('rejects a legacy initialize opening — legacy: "reject" enforces TIP §27', async () => {
    // A real legacy client doesn't send the modern Mcp-Method/MCP-Protocol-
    // Version headers at all — simulate that directly rather than via
    // postRpc's mcpHeaders(), which would misrepresent what a 2025 client
    // actually sends.
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1.0' } },
      }),
    });
    const body = await jsonBody(res);
    expect(body.error).toBeDefined();
  });

  it('rejects GET on the MCP endpoint (modern era has no GET stream) — TIP §26.4', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await fetch(handle.url, { method: 'GET' });
    expect(res.status).toBe(405);
  });
});

describe('serveToolsOverHttp — Origin/Host validation (TIP §26.2, FR-HTTP-MCP-004)', () => {
  it('accepts a request with no Origin header (a normal non-browser MCP client)', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await postRpc(handle.url, { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } });
    expect(res.status).not.toBe(403);
  });

  it('accepts a request with an allowed (localhost) Origin', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await postRpc(
      handle.url,
      { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } },
      { origin: 'http://localhost:1234' },
    );
    expect(res.status).not.toBe(403);
  });

  it('rejects a request with a disallowed Origin — DNS rebinding protection', async () => {
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const res = await postRpc(
      handle.url,
      { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } },
      { origin: 'http://evil.example.com' },
    );
    expect(res.status).toBe(403);
  });

  it('rejects a request with a disallowed Host header', async () => {
    // fetch()/undici silently overrides a custom Host header (verified: the
    // server received the real connection host, not the spoofed one), so
    // this needs node:http.request, which does not restrict it.
    handle = await serveToolsOverHttp([echoTool], { name: 'test-server', version: '0.0.1' });
    const url = new URL(handle.url);
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', host: 'evil.example.com' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } }));
    });
    expect(status).toBe(403);
  });
});
