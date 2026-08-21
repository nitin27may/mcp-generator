import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, startFixtureIdp, type FixtureApiHandle, type FixtureIdpHandle } from '../../src/index.js';

/**
 * ADR-0010 end to end: the caller's verified MCP token is EXCHANGED for an upstream one,
 * and the caller's own token still never reaches the upstream.
 *
 * This is the case that makes the invariant non-trivial. Everywhere else the two planes
 * are structurally unable to touch; here they touch by design, and the only thing keeping
 * "acted as the user" apart from "forwarded the user's token" is that the exchange happens
 * with the authorization server and its output — not its input — is what goes upstream.
 *
 * Driven through the real CLI binary with a real signing IdP, so the assertions are about
 * bytes on the wire rather than about how the code is arranged.
 */

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/mcpgen.mjs', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.exchange.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

const EXCHANGE_CLIENT_ID = 'mcp-exchange-client';
const EXCHANGE_CLIENT_SECRET = 'sk-e2e-exchange-client-secret';
const UPSTREAM_AUDIENCE = 'https://customers.example.com';

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

/**
 * `tokenUrl` is a plain string in the schema, not a binding, so it cannot come from the
 * environment the way `issuer` and `resource` do — and the fixture IdP's port is only
 * known at run time. Same workaround the client-credentials E2E uses. Worth noting as a
 * real inconsistency in the config surface rather than hiding it in a helper.
 */
async function writeConfigWithTokenUrl(tokenUrl: string): Promise<string> {
  const template = await readFile(CONFIG_PATH, 'utf8');
  const dir = await mkdtemp(join(tmpdir(), 'mcpgen-exchange-security-'));
  const path = join(dir, 'mcp.config.json');
  await writeFile(path, template.replace('http://placeholder.invalid/token', tokenUrl), 'utf8');
  return path;
}

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
          // not a JSON line
        }
      }
    });
  });
}

async function startDelegated(): Promise<{ url: string; callerToken: string }> {
  const port = await reservePort();
  const resource = `http://127.0.0.1:${port}/mcp`;

  idp = await startFixtureIdp({
    defaultAudience: resource,
    clients: [
      { clientId: 'fixture-client' },
      { clientId: EXCHANGE_CLIENT_ID, clientSecret: EXCHANGE_CLIENT_SECRET },
    ],
  });

  // The upstream accepts any token the IdP minted for IT — which is precisely what an
  // exchanged token is, and precisely what the caller's token is not.
  api = await startFixtureApi({
    expectedToken: 'sk-e2e-unused-when-acceptToken-is-set',
    acceptToken: (token) => {
      try {
        const claims = decodeJwt(token);
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        return claims.iss === idp!.issuer && audiences.includes(UPSTREAM_AUDIENCE);
      } catch {
        return false;
      }
    },
  });

  const configPath = await writeConfigWithTokenUrl(idp.tokenEndpoint);
  child = spawn(
    process.execPath,
    [CLI_ENTRY, 'serve', '--transport', 'http', '--port', String(port), '--config', configPath, '--spec', SPEC_PATH],
    {
      env: {
        ...process.env,
        CUSTOMER_API_URL: api.baseUrl,
        MCP_ISSUER_URL: idp.issuer,
        MCP_PUBLIC_URL: resource,
        EXCHANGE_CLIENT_ID,
        EXCHANGE_CLIENT_SECRET,
      },
    },
  );

  const url = await waitForServingUrl(child);
  const callerToken = await idp.mintAccessToken({ audience: resource, scopes: ['mcp:tools'], subject: 'alice' });
  return { url, callerToken };
}

function callHeaders(token: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': 'tools/call',
    'Mcp-Name': 'get_customer',
    authorization: `Bearer ${token}`,
  };
}

function callBody(id: number) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'get_customer',
      arguments: { customer_id: 'c-42' },
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'exchange-security', version: '1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
}

describe('ADR-0010 — token exchange delegates identity without forwarding the token', () => {
  it('sends the upstream an exchanged token, never the caller token', async () => {
    const { url, callerToken } = await startDelegated();

    const response = await fetch(url, { method: 'POST', headers: callHeaders(callerToken), body: callBody(1) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { structuredContent: { id: string } } };
    expect(body.result.structuredContent).toMatchObject({ id: 'c-42' });

    const upstream = api!.requests.at(-1)!;
    const presented = /^Bearer (.+)$/.exec(String(upstream.headers.authorization))?.[1];
    expect(presented).toBeDefined();

    // BR-008: not the caller's token.
    expect(presented).not.toBe(callerToken);
    expect(JSON.stringify({ url: upstream.url, headers: upstream.headers })).not.toContain(callerToken);

    // And it really is an exchanged token: minted for the UPSTREAM audience, not for the
    // MCP server, while still carrying the caller's identity rather than the client's.
    const claims = decodeJwt(presented!);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    expect(audiences).toContain(UPSTREAM_AUDIENCE);
    expect(claims.sub).toBe('fixture-user');
  });

  it('performs the exchange against the authorization server, not the upstream', async () => {
    const { url, callerToken } = await startDelegated();
    await fetch(url, { method: 'POST', headers: callHeaders(callerToken), body: callBody(2) });

    // The IdP saw a token request; the upstream only ever saw the resource call.
    expect(idp!.requests.some((r) => r.url === '/token')).toBe(true);
    expect(api!.requests.every((r) => !r.url.includes('/token'))).toBe(true);
  });

  it('does not leak the exchanged token into the MCP response', async () => {
    const { url, callerToken } = await startDelegated();
    const response = await fetch(url, { method: 'POST', headers: callHeaders(callerToken), body: callBody(3) });
    const text = await response.text();

    const presented = /^Bearer (.+)$/.exec(String(api!.requests.at(-1)!.headers.authorization))?.[1];
    expect(text).not.toContain(presented);
    expect(text).not.toContain(callerToken);
  });

  it('refuses the tool call outright when the caller is unauthenticated — nothing to exchange', async () => {
    const { url } = await startDelegated();
    const before = api!.requests.length;

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...callHeaders('x'), authorization: '' },
      body: callBody(4),
    });

    expect(response.status).toBe(401);
    expect(api!.requests.length).toBe(before);
  });
});
