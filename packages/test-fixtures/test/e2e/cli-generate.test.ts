import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/mcpgen.mjs', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-cli-generate-sentinel';

let outputDir: string | undefined;
let api: FixtureApiHandle | undefined;
let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  child?.kill();
  child = undefined;
  await api?.stop();
  api = undefined;
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
  outputDir = undefined;
});

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Increment 0 of the UI plan: the CLI previously had no `generate` command —
 * only `generateProject()` called directly in generator's own tests proved
 * generation worked. This proves the real, spawned CLI entrypoint (the thing
 * a `npm install -g` user actually runs) produces the same working package.
 */
describe('CLI `generate` — real spawned entrypoint, not a direct generateProject() call', () => {
  it('exits 0 and writes a complete package to --out', async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-generate-'));
    const result = runCli(['generate', '--config', CONFIG_PATH, '--spec', SPEC_PATH, '--out', outputDir]);

    expect(result.status, result.stderr).toBe(0);
    for (const file of ['package.json', 'mcp.config.json', 'generated-manifest.json', '.env.example', 'README.md', 'dist/cli.mjs']) {
      await expect(readFile(join(outputDir, file), 'utf8')).resolves.not.toBe('');
    }
  });

  it('the generated package installs and actually serves — CLI generate and the web app would produce the same runnable output from the same config', async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-generate-'));
    const generate = runCli(['generate', '--config', CONFIG_PATH, '--spec', SPEC_PATH, '--out', outputDir]);
    expect(generate.status, generate.stderr).toBe(0);

    const install = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: outputDir, encoding: 'utf8' });
    expect(install.status, install.stderr).toBe(0);

    api = await startFixtureApi({ expectedToken: API_KEY });
    child = spawn(process.execPath, ['dist/cli.mjs', 'serve'], {
      cwd: outputDir,
      env: { CUSTOMER_API_URL: api.baseUrl, CUSTOMER_API_KEY: API_KEY },
    });

    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a response')), 10_000);
      let buffer = '';
      child!.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex !== -1) {
          clearTimeout(timer);
          resolve(JSON.parse(buffer.slice(0, newlineIndex)));
        }
      });
      setTimeout(() => {
        child!.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'get_customer',
              arguments: { customer_id: 'c-42' },
              _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientInfo': { name: 'e2e-cli-generate', version: '1.0' },
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            },
          })}\n`,
        );
      }, 300);
    });

    const result = response.result as { isError?: boolean; structuredContent?: unknown };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: 'c-42' });
  }, 30_000);

  it('exits non-zero and prints nothing to stdout when the spec fails to parse', async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-generate-'));
    const result = runCli(['generate', '--config', CONFIG_PATH, '--spec', '/nonexistent/openapi.json', '--out', outputDir]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });
});
