import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const CONFIG_TEMPLATE_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.oauth.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const ACCESS_TOKEN = 'access-token-issued-by-e2e-token-server';
const CLIENT_SECRET = 'e2e-client-secret';

interface TokenServerHandle {
  readonly url: string;
  readonly requests: { readonly body: string }[];
  respondWith(status: number, body: unknown): void;
  stop(): Promise<void>;
}

/** Real RFC 6749 client_credentials token endpoint, minimal — issues ACCESS_TOKEN for any correctly-shaped request. */
async function startTokenServer(): Promise<TokenServerHandle> {
  const requests: { body: string }[] = [];
  let statusOverride: { status: number; body: unknown } | undefined;

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({ body });

      if (statusOverride) {
        res.writeHead(statusOverride.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(statusOverride.body));
        return;
      }

      const params = new URLSearchParams(body);
      if (params.get('grant_type') !== 'client_credentials' || params.get('client_secret') !== CLIENT_SECRET) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_client' }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 3600, token_type: 'Bearer' }));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/token`,
    requests,
    respondWith: (status, body) => (statusOverride = { status, body }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function writeConfigWithTokenUrl(tokenUrl: string): Promise<string> {
  const template = await readFile(CONFIG_TEMPLATE_PATH, 'utf8');
  const config = template.replace('http://placeholder.invalid/token', tokenUrl);
  const dir = await mkdtemp(join(tmpdir(), 'mcpgen-oauth-e2e-'));
  const path = join(dir, 'customer.oauth.mcp.config.json');
  await writeFile(path, config, 'utf8');
  return path;
}

let api: FixtureApiHandle | undefined;
let tokenServer: TokenServerHandle | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  await api?.stop();
  api = undefined;
  await tokenServer?.stop();
  tokenServer = undefined;
});

async function connectToSpawnedCli(configPath: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRY, 'serve', '--config', configPath, '--spec', SPEC_PATH],
    env: { CUSTOMER_API_URL: api!.baseUrl, OAUTH_CLIENT_SECRET: CLIENT_SECRET },
  });
  const c = new Client({ name: 'oauth-e2e-client', version: '0.0.1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await c.connect(transport);
  return c;
}

describe('CLI `serve` — oauth2ClientCredentials upstream auth, real end to end', () => {
  it('acquires a token from the real token endpoint and attaches it as Authorization: Bearer on the real upstream request', async () => {
    api = await startFixtureApi({ expectedToken: ACCESS_TOKEN });
    tokenServer = await startTokenServer();
    const configPath = await writeConfigWithTokenUrl(tokenServer.url);
    client = await connectToSpawnedCli(configPath);

    const result = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: 'c-42', name: 'Ada Lovelace' });

    const upstreamRequest = api.requests.at(-1)!;
    expect(upstreamRequest.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(tokenServer.requests).toHaveLength(1);
  });

  it('caches the token across two tool calls in the same server process — only one token-endpoint request total', async () => {
    api = await startFixtureApi({ expectedToken: ACCESS_TOKEN });
    tokenServer = await startTokenServer();
    const configPath = await writeConfigWithTokenUrl(tokenServer.url);
    client = await connectToSpawnedCli(configPath);

    await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });
    const second = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });

    expect(second.isError).toBeFalsy();
    expect(tokenServer.requests).toHaveLength(1);
    expect(api.requests).toHaveLength(2);
  });

  it('surfaces an AUT-003 error when the token endpoint rejects the credentials', async () => {
    api = await startFixtureApi({ expectedToken: ACCESS_TOKEN });
    tokenServer = await startTokenServer();
    tokenServer.respondWith(401, { error: 'invalid_client' });
    const configPath = await writeConfigWithTokenUrl(tokenServer.url);
    client = await connectToSpawnedCli(configPath);

    const result = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });

    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('AUT-003');
  });
});
