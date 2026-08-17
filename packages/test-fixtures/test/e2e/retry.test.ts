import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-retry-e2e-sentinel';

interface FlakyServerHandle {
  readonly baseUrl: string;
  requestCount(): number;
  stop(): Promise<void>;
}

/** Fails with a transient 503 for the first `failCount` requests to /customers/{id}, then serves the real customer. */
async function startFlakyServer(failCount: number): Promise<FlakyServerHandle> {
  let calls = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${API_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    calls++;
    if (calls <= failCount) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'temporarily unavailable' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'c-42', name: 'Ada Lovelace', email: 'ada@example.com' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requestCount: () => calls,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let flaky: FlakyServerHandle | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  await flaky?.stop();
  flaky = undefined;
});

async function connectToSpawnedCli(baseUrl: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH],
    env: { CUSTOMER_API_URL: baseUrl, CUSTOMER_API_KEY: API_KEY },
  });
  const c = new Client({ name: 'retry-e2e-client', version: '0.0.1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await c.connect(transport);
  return c;
}

describe('CLI `serve` — retry policy (TIP §21), real end to end', () => {
  it('transparently retries a transient 503 on the GET tool and returns the real result once the upstream recovers', async () => {
    flaky = await startFlakyServer(2); // fails twice, succeeds on the 3rd attempt — within the default maxAttempts: 3
    client = await connectToSpawnedCli(flaky.baseUrl);

    const result = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: 'c-42', name: 'Ada Lovelace' });
    expect(flaky.requestCount()).toBe(3);
  });

  it('never retries the POST tool (create_customer) — a single request even against a flaky upstream', async () => {
    flaky = await startFlakyServer(2);
    client = await connectToSpawnedCli(flaky.baseUrl);

    const result = await client.callTool({ name: 'create_customer', arguments: { name: 'Grace Hopper', email: 'grace@example.com' } });

    expect(result.isError).toBe(true);
    expect(flaky.requestCount()).toBe(1);
  });
});
