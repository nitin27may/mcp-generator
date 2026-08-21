import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, startFixtureIdp, type FixtureApiHandle, type FixtureIdpHandle } from '../../src/index.js';

/**
 * BR-008 / ADR-0005 / R11 — the inbound MCP access token is NEVER forwarded upstream.
 *
 * ADR-0005 has claimed since it was written that "a token-passthrough regression test
 * lives in the security suite". It did not. This is that test.
 *
 * MCP 2026-07-28 states the rule as a normative MUST NOT, and the reason is concrete: the
 * upstream API has no way to tell a token the MCP server was given from one it was meant
 * to present, so a server that forwards the caller's token turns every upstream into a
 * confused deputy. Today the invariant holds structurally — `upstream-auth` cannot even
 * import `mcp-protocol`, and the boundary linter enforces it. This test exists because
 * that structural argument stops being sufficient the moment Plane B learns to exchange
 * the inbound token (RFC 8693): at that point the two planes finally touch, and the thing
 * that must still never happen is the raw subject token reaching the upstream.
 *
 * Both planes are live here, with deliberately distinct sentinels, so "the upstream got
 * the right credential" and "the upstream did not get the wrong one" are separate
 * assertions rather than one lucky coincidence.
 */

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/mcpgen.mjs', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcpaccess.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

/** The credential the MCP server is configured to present upstream (Plane B). */
const UPSTREAM_KEY = 'sk-upstream-plane-b-sentinel';

let api: FixtureApiHandle | undefined;
let idp: FixtureIdpHandle | undefined;
let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  child?.kill();
  child = undefined;
  await api?.stop();
  api = undefined;
  await idp?.stop();
  idp = undefined;
});

async function reservePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function waitForServingUrl(proc: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "serving"; stderr was:\n${stderr}`)), 15_000);
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as { message?: string; data?: { url?: string } };
          if (record.message === 'serving' && record.data?.url) {
            clearTimeout(timer);
            resolve(record.data.url);
          }
        } catch {
          // not a JSON line; ignore
        }
      }
    });
  });
}

function meta() {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'passthrough-security', version: '1.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

async function startBothPlanes(): Promise<{ url: string; inboundToken: string }> {
  const port = await reservePort();
  const resource = `http://127.0.0.1:${port}/mcp`;

  api = await startFixtureApi({ expectedToken: UPSTREAM_KEY });
  idp = await startFixtureIdp({ defaultAudience: resource, clients: [{ clientId: 'fixture-client' }] });

  child = spawn(
    process.execPath,
    [CLI_ENTRY, 'serve', '--transport', 'http', '--port', String(port), '--config', CONFIG_PATH, '--spec', SPEC_PATH],
    {
      env: {
        ...process.env,
        CUSTOMER_API_URL: api.baseUrl,
        CUSTOMER_API_KEY: UPSTREAM_KEY,
        MCP_ISSUER_URL: idp.issuer,
        MCP_PUBLIC_URL: resource,
      },
    },
  );

  const url = await waitForServingUrl(child);
  const inboundToken = await idp.mintAccessToken({ audience: resource, scopes: ['mcp:tools'], subject: 'user-77' });
  return { url, inboundToken };
}

describe('BR-008 — the Plane A token never reaches the upstream API', () => {
  it('presents the configured upstream credential, not the caller token', async () => {
    const { url, inboundToken } = await startBothPlanes();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'get_customer',
        authorization: `Bearer ${inboundToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_customer', arguments: { customer_id: 'c-42' }, _meta: meta() },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { structuredContent: { id: string } } };
    expect(body.result.structuredContent).toMatchObject({ id: 'c-42' });

    // The upstream was actually reached, and with the right credential.
    const upstream = api!.requests.at(-1)!;
    expect(upstream.headers.authorization).toBe(`Bearer ${UPSTREAM_KEY}`);

    // And the inbound token appears nowhere in that request — not in the Authorization
    // header it replaced, not smuggled into another header, not in the URL.
    const serialized = JSON.stringify({ url: upstream.url, headers: upstream.headers, body: upstream.body });
    expect(serialized).not.toContain(inboundToken);
  });

  it('does not surface the caller token in the MCP response either', async () => {
    const { url, inboundToken } = await startBothPlanes();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'get_customer',
        authorization: `Bearer ${inboundToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_customer', arguments: { customer_id: 'c-42' }, _meta: meta() },
      }),
    });

    expect(await response.text()).not.toContain(inboundToken);
  });

  it('never reaches the upstream at all when the caller token is refused', async () => {
    const { url } = await startBothPlanes();
    const foreign = await idp!.mintAccessToken({ audience: 'https://somewhere-else.example.com/mcp' });
    const before = api!.requests.length;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'get_customer',
        authorization: `Bearer ${foreign}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_customer', arguments: { customer_id: 'c-42' }, _meta: meta() },
      }),
    });

    expect(response.status).toBe(401);
    // Authorization runs before anything is executed: a refused call costs the upstream nothing.
    expect(api!.requests.length).toBe(before);
  });
});
