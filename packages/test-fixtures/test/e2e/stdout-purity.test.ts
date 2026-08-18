import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/mcpgen.mjs', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-purity-sentinel';

let api: FixtureApiHandle | undefined;
let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  child?.kill();
  child = undefined;
  await api?.stop();
  api = undefined;
});

function spawnCli(): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH], {
    env: { ...process.env, CUSTOMER_API_URL: api!.baseUrl, CUSTOMER_API_KEY: API_KEY },
  });
}

function collectStdoutLines(proc: ChildProcessWithoutNullStreams, count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const lines: string[] = [];
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${count} stdout line(s)`)), 5_000);

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        lines.push(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        if (lines.length >= count) {
          clearTimeout(timer);
          resolve(lines);
          return;
        }
      }
    });
  });
}

/** BR-009 / TIP §25.2/§92.8 — the invariant most likely to regress silently. */
describe('CLI `serve` — stdout purity (P0-W25-T03)', () => {
  it('stdout carries only newline-delimited JSON-RPC, no stray bytes, no embedded newlines', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    child = spawnCli();

    const discover = { jsonrpc: '2.0', id: 1, method: 'server/discover', params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'purity-test', version: '1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    } };
    const toolsList = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'purity-test', version: '1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    } };

    const lines = collectStdoutLines(child, 2);
    child.stdin.write(`${JSON.stringify(discover)}\n`);
    child.stdin.write(`${JSON.stringify(toolsList)}\n`);
    const [discoverLine, toolsLine] = await lines;

    // Every line must parse as a single JSON value — one JSON-RPC message,
    // nothing appended, nothing prepended (a stray console.log would show
    // up as either a non-JSON line or extra bytes breaking the parse).
    const discoverMsg = JSON.parse(discoverLine!);
    const toolsMsg = JSON.parse(toolsLine!);

    expect(discoverMsg.result.supportedVersions).toContain('2026-07-28');
    expect(toolsMsg.result.tools).toHaveLength(3);
  });

  it('writes all logging to stderr, never stdout, during normal operation', async () => {
    api = await startFixtureApi({ expectedToken: API_KEY });
    child = spawnCli();

    let stderrData = '';
    child.stderr.on('data', (chunk: Buffer) => (stderrData += chunk.toString('utf8')));

    const request = { jsonrpc: '2.0', id: 1, method: 'server/discover', params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'purity-test', version: '1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    } };
    const lines = collectStdoutLines(child, 1);
    child.stdin.write(`${JSON.stringify(request)}\n`);
    await lines;

    // The "serving" log line goes to stderr, confirming the logger is wired
    // correctly rather than this test passing by coincidence (no logs at all).
    expect(stderrData).toContain('"message":"serving"');
  });
});
