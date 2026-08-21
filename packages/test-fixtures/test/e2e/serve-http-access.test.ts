import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpAccessGate, serveToolsOverHttp, type McpHttpServerHandle } from '@mcpgen/mcp-protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureIdp, type FixtureIdpHandle } from '../../src/index.js';

/**
 * Plane A over the real Streamable HTTP transport (ADR-0005, `P6-W23-E01`).
 *
 * The gate is unit-tested in test/security; this asserts the wiring around it — that
 * discovery and health answer without a token, that `/mcp` does not, and that the
 * ordering of the Host/Origin guards against the bearer gate is what it claims to be.
 */

let idp: FixtureIdpHandle | undefined;
let server: McpHttpServerHandle | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  await idp?.stop();
  idp = undefined;
});

/** The gate needs the server's own URL before the server starts, so the port is reserved first. */
async function reservePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

const echoTool = {
  name: 'echo',
  description: 'Echoes its input.',
  inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } as Record<string, unknown>,
  execute: async (args: Record<string, unknown>) => ({
    content: [{ type: 'text' as const, text: String(args['value']) }],
    structuredContent: { echoed: args['value'] },
    resultType: 'complete' as const,
  }),
};

function meta() {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'access-e2e', version: '1.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

function mcpHeaders(method: string, token?: string, name?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': method,
  };
  if (name) headers['Mcp-Name'] = name;
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

async function startProtected(): Promise<{ url: string; origin: string; resource: string }> {
  const port = await reservePort();
  const resource = `http://127.0.0.1:${port}/mcp`;
  idp = await startFixtureIdp({ defaultAudience: resource, clients: [{ clientId: 'fixture-client' }] });
  const access = await createMcpAccessGate({
    issuer: idp.issuer,
    resource,
    dangerouslyAllowInsecureIssuer: true,
  });
  server = await serveToolsOverHttp([echoTool], { name: 'access-fixture', version: '0.0.0' }, { port, access });
  return { url: server.url, origin: `http://127.0.0.1:${port}`, resource };
}

describe('serve --transport http with mcpAccess', () => {
  it('answers an unauthenticated tools/call with 401 and a discoverable challenge', async () => {
    const { url } = await startProtected();
    const response = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders('tools/list'),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate') ?? '').toContain('resource_metadata');
  });

  it('serves protected resource metadata WITHOUT a token — a client cannot get one until it reads this', async () => {
    const { origin, resource } = await startProtected();
    const response = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
    expect(response.status).toBe(200);
    const document = (await response.json()) as { resource: string; authorization_servers: string[] };
    expect(document.resource).toBe(resource);
    expect(document.authorization_servers).toContain(idp!.issuer);
  });

  it('keeps /health unauthenticated — a readiness probe carries no credential', async () => {
    const { origin } = await startProtected();
    const response = await fetch(`${origin}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('accepts a correctly-audienced token and executes the tool', async () => {
    const { url, resource } = await startProtected();
    const token = await idp!.mintAccessToken({ audience: resource, scopes: ['mcp:tools'] });
    const response = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders('tools/call', token, 'echo'),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'echo', arguments: { value: 'hello' }, _meta: meta() },
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { structuredContent: { echoed: string } } };
    expect(body.result.structuredContent).toEqual({ echoed: 'hello' });
  });

  it('refuses a token minted for another resource server', async () => {
    const { url } = await startProtected();
    const token = await idp!.mintAccessToken({ audience: 'http://127.0.0.1:1/mcp', scopes: ['mcp:tools'] });
    const response = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders('tools/list', token),
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: meta() } }),
    });
    expect(response.status).toBe(401);
  });

  it('refuses a cross-origin request before authorization runs — rebinding is rejected first', async () => {
    const { url, resource } = await startProtected();
    const token = await idp!.mintAccessToken({ audience: resource });
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...mcpHeaders('tools/list', token), origin: 'http://evil.example.com' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: { _meta: meta() } }),
    });
    // 403 from the Origin guard, not 401 from the bearer gate: a rebinding attempt learns
    // nothing about which authorization server this deployment trusts.
    expect(response.status).toBe(403);
  });

  it('leaves the endpoint open when no access gate is configured', async () => {
    server = await serveToolsOverHttp([echoTool], { name: 'open-fixture', version: '0.0.0' }, {});
    const response = await fetch(server.url, {
      method: 'POST',
      headers: mcpHeaders('tools/list'),
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: { _meta: meta() } }),
    });
    expect(response.status).toBe(200);
  });
});
