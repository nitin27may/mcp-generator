import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-e2e-sentinel';

let api: FixtureApiHandle | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  await api?.stop();
  api = undefined;
});

/**
 * Spawns the REAL CLI as a subprocess and connects a REAL MCP client to it
 * over REAL stdio — this is the P0-W25-T02 protocol E2E, and the sole
 * consumer of `@modelcontextprotocol/client` outside `mcp-protocol`'s own
 * unit tests (the `test-fixtures` boundary exemption exists for exactly
 * this). Pinned to the modern era per research notes §15: the client
 * defaults to legacy, and this proves the whole stack — CLI, mcp-runtime,
 * mcp-protocol, and the SDK — actually negotiates 2026-07-28 end to end,
 * not just in an in-process unit test.
 */
async function connectToSpawnedCli(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH],
    env: { CUSTOMER_API_URL: api!.baseUrl, CUSTOMER_API_KEY: API_KEY },
  });
  const c = new Client({ name: 'e2e-client', version: '0.0.1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await c.connect(transport);
  return c;
}

describe('CLI `serve` — full stack over real stdio (P0-W25-T02)', () => {
  it('lists all three P0 tools', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    client = await connectToSpawnedCli();

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['create_customer', 'get_customer', 'list_customers']);
  });

  it('calling get_customer reaches the real fixture API with the exact expected request', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    client = await connectToSpawnedCli();

    const result = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42', expand: 'orders' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: 'c-42', name: 'Ada Lovelace' });

    const request = api.requests.at(-1)!;
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/customers/c-42?expand=orders');
    expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('calling list_customers with pagination args reaches the API correctly', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    client = await connectToSpawnedCli();

    const result = await client.callTool({ name: 'list_customers', arguments: { page: 1, page_size: 10 } });
    expect(result.isError).toBeFalsy();

    const request = api.requests.at(-1)!;
    expect(request.url).toBe('/customers?page=1&pageSize=10');
  });

  it('calling create_customer sends a JSON body the API parses and persists', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    client = await connectToSpawnedCli();

    const result = await client.callTool({
      name: 'create_customer',
      arguments: { name: 'Grace Hopper', email: 'grace@example.com' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ name: 'Grace Hopper', email: 'grace@example.com' });

    const request = api.requests.at(-1)!;
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({ name: 'Grace Hopper', email: 'grace@example.com' });
  });

  it('never leaks the API key anywhere in the MCP-visible tool result', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    client = await connectToSpawnedCli();

    const result = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});
