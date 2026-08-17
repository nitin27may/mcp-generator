import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-leakage-sentinel';

let api: FixtureApiHandle | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  await api?.stop();
  api = undefined;
});

/** ADR-0006 / P0-W25-T04 — the secret must not appear in config export, stderr logs, or tool results. */
describe('secret leakage — across config export, logs, and tool execution', () => {
  it('print-config never contains the secret — it structurally cannot (SecretBinding has no value field)', () => {
    const result = spawnSync(process.execPath, [CLI_ENTRY, 'print-config', '--config', CONFIG_PATH], {
      encoding: 'utf8',
      env: { ...process.env, CUSTOMER_API_KEY: API_KEY },
    });
    expect(result.stdout).not.toContain(API_KEY);
    expect(result.stdout).toContain('"source": "secret"');
  });

  it('the secret never appears in stderr logs during a normal, successful run', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH],
      env: { CUSTOMER_API_URL: api.baseUrl, CUSTOMER_API_KEY: API_KEY },
      stderr: 'pipe',
    });

    let stderrData = '';
    transport.stderr?.on('data', (chunk: Buffer) => (stderrData += chunk.toString('utf8')));

    client = new Client({ name: 'leakage-test', version: '0.0.1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    await client.connect(transport);
    await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });

    expect(stderrData).toContain('"message":"serving"'); // confirms logs are actually flowing through this pipe
    expect(stderrData).not.toContain(API_KEY);
  });

  it('a 401 (wrong credential) response body does not surface the expected token anywhere in the MCP result', async () => {
    api = await startFixtureApi({ expectedToken: 'a-different-token-than-configured' });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH],
      env: { CUSTOMER_API_URL: api.baseUrl, CUSTOMER_API_KEY: API_KEY },
    });
    client = new Client({ name: 'leakage-test', version: '0.0.1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    await client.connect(transport);

    const result = await client.callTool({ name: 'get_customer', arguments: { customer_id: 'c-42' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});
