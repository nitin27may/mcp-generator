import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-http-e2e-sentinel';

let api: FixtureApiHandle | undefined;
let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  child?.kill();
  child = undefined;
  await api?.stop();
  api = undefined;
});

/** _meta envelope + request-metadata headers a real modern client sends (TIP §92.2). */
function meta() {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'http-e2e', version: '1.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

function mcpHeaders(method: string, name?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': method,
  };
  if (name) headers['Mcp-Name'] = name;
  return headers;
}

/** Extracts the bound URL from the CLI's own "serving" stderr log line, since a spawned child never returns one directly. */
function waitForServingUrl(proc: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for the "serving" log line')), 5_000);
    proc.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
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

describe('CLI `serve --transport http` — real Streamable HTTP over a spawned process', () => {
  it('serves all three P0 tools and executes get_customer against the real fixture API', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    child = spawn(process.execPath, [CLI_ENTRY, 'serve', '--transport', 'http', '--port', '0', '--config', CONFIG_PATH, '--spec', SPEC_PATH], {
      env: { ...process.env, CUSTOMER_API_URL: api.baseUrl, CUSTOMER_API_KEY: API_KEY },
    });

    const url = await waitForServingUrl(child);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const listRes = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders('tools/list'),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta() } }),
    });
    const listBody = (await listRes.json()) as { result: { tools: { name: string }[] } };
    expect(listBody.result.tools.map((t) => t.name).sort()).toEqual(['create_customer', 'get_customer', 'list_customers']);

    const callRes = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders('tools/call', 'get_customer'),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_customer', arguments: { customer_id: 'c-42' }, _meta: meta() },
      }),
    });
    const callBody = (await callRes.json()) as { result: { structuredContent: { id: string } } };
    expect(callBody.result.structuredContent).toMatchObject({ id: 'c-42', name: 'Ada Lovelace' });

    const request = api.requests.at(-1)!;
    expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('rejects a cross-origin request — DNS rebinding protection is live end to end', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    child = spawn(process.execPath, [CLI_ENTRY, 'serve', '--transport', 'http', '--port', '0', '--config', CONFIG_PATH, '--spec', SPEC_PATH], {
      env: { ...process.env, CUSTOMER_API_URL: api.baseUrl, CUSTOMER_API_KEY: API_KEY },
    });
    const url = await waitForServingUrl(child);

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...mcpHeaders('server/discover'), origin: 'http://evil.example.com' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta() } }),
    });
    expect(res.status).toBe(403);
  });
});
