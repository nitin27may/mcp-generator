import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parseProjectConfig } from '@mcpgen/config-schema';
import { generateProject } from '@mcpgen/generator';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CONFIG_TEMPLATE_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.oauth.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const ACCESS_TOKEN = 'access-token-issued-by-generated-package-e2e';
const CLIENT_SECRET = 'generated-package-e2e-client-secret';

interface TokenServerHandle {
  readonly url: string;
  readonly requests: { readonly body: string }[];
  stop(): Promise<void>;
}

/** Real RFC 6749 client_credentials token endpoint, minimal — issues ACCESS_TOKEN for any correctly-shaped request. */
async function startTokenServer(): Promise<TokenServerHandle> {
  const requests: { body: string }[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      requests.push({ body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 3600, token_type: 'Bearer' }));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/token`,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let outputDir: string | undefined;
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
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
  outputDir = undefined;
});

async function generateOAuthProject(tokenUrl: string): Promise<string> {
  const spec = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
  if (!parsed.value) throw new Error(`fixture spec failed to parse: ${JSON.stringify(parsed.diagnostics)}`);
  const operations = Object.fromEntries(parsed.value.operations.map((op) => [op.id, op]));

  const template = await readFile(CONFIG_TEMPLATE_PATH, 'utf8');
  const configRaw = JSON.parse(template.replace('http://placeholder.invalid/token', tokenUrl));
  const configResult = parseProjectConfig(configRaw);
  if (!configResult.value) throw new Error(`fixture config failed to parse: ${JSON.stringify(configResult.diagnostics)}`);

  const dir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-generated-oauth-'));
  const result = await generateProject({ config: configResult.value, operations }, dir);
  if (result.diagnostics.length > 0) throw new Error(`generation failed: ${JSON.stringify(result.diagnostics)}`);
  return dir;
}

/**
 * Regression coverage for a real bug: `runtime-entry/commands/serve.ts` built its tool registry
 * without an `oauthTokenProvider`, unlike `apps/cli`'s own serve command — so every OAuth2 tool
 * call in a *generated* server re-acquired a token from scratch (`attach-auth.ts`'s per-call
 * fallback), silently losing the caching `oauth-retry.test.ts` already proves for apps/cli itself.
 */
describe('generated package — OAuth2 token caching (regression for the missing oauthTokenProvider)', () => {
  it('caches the token across two tool calls in the same served process — only one token-endpoint request total', async () => {
    api = await startFixtureApi({ expectedToken: ACCESS_TOKEN });
    tokenServer = await startTokenServer();
    const dir = await generateOAuthProject(tokenServer.url);
    spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['dist/cli.mjs', 'serve'],
      cwd: dir,
      env: { CUSTOMER_API_URL: api.baseUrl, OAUTH_CLIENT_SECRET: CLIENT_SECRET },
    });
    client = new Client({ name: 'generated-oauth-e2e', version: '0.0.1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    await client.connect(transport);

    await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });
    const second = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });

    expect(second.isError).toBeFalsy();
    expect(tokenServer.requests).toHaveLength(1);
    expect(api.requests).toHaveLength(2);
  }, 30_000);
});
