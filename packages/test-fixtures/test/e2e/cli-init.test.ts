import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi, type FixtureApiHandle } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const API_KEY = 'sk-cli-init-e2e-sentinel';

function runCli(args: string[], cwd?: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let dir: string | undefined;
let api: FixtureApiHandle | undefined;
let child: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  child?.kill();
  child = undefined;
  await api?.stop();
  api = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

/**
 * The CLI-only counterpart to the web wizard's import step: previously a CLI-only user had no way
 * to author an mcp.config.json short of hand-writing every tool entry. This proves the whole
 * chain a real user would actually run, against the real spawned entrypoint end to end: derive a
 * config from a spec, enable a tool, validate it, generate a real package, install it, and serve
 * a real tool call — the same fixture pipeline `cli-generate.test.ts` proves for a hand-authored
 * config, starting one step earlier.
 */
describe('CLI `init` — real spawned entrypoint, feeding straight into validate/generate/serve', () => {
  it('derives a config, enables the read-only tools, and the rest of the pipeline accepts it as-is', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-init-'));
    const configPath = join(dir, 'mcp.config.json');
    const outDir = join(dir, 'server');

    const initResult = runCli(['init', '--spec', SPEC_PATH, '--out', configPath, '--enable-read-only']);
    expect(initResult.status, initResult.stderr).toBe(0);
    expect(initResult.stdout).toContain('2 enabled');

    const config = JSON.parse(await readFile(configPath, 'utf8'));
    expect(Object.values(config.tools).filter((t: { enabled: boolean }) => t.enabled)).toHaveLength(2);

    api = await startFixtureApi({ expectedToken: API_KEY });
    const validateResult = runCli(['validate', '--config', configPath, '--spec', SPEC_PATH], undefined);
    // Real credentials aren't set in this process's env — expected to fail validation. Note the
    // seeded names are CUSTOMER_API_BASE_URL/CUSTOMER_API_TOKEN, not the hand-authored fixture's
    // CUSTOMER_API_URL/CUSTOMER_API_KEY (bearer auth derives an env name ending in _TOKEN).
    expect(validateResult.status).toBe(1);
    expect(validateResult.stderr).toContain('CUSTOMER_API_BASE_URL');
    expect(validateResult.stderr).toContain('CUSTOMER_API_TOKEN');

    const generateResult = runCli(['generate', '--config', configPath, '--spec', SPEC_PATH, '--out', outDir]);
    expect(generateResult.status, generateResult.stderr).toBe(0);

    const install = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: outDir, encoding: 'utf8' });
    expect(install.status, install.stderr).toBe(0);

    child = spawn(process.execPath, ['dist/cli.mjs', 'serve'], {
      cwd: outDir,
      env: { CUSTOMER_API_BASE_URL: api.baseUrl, CUSTOMER_API_TOKEN: API_KEY },
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
              name: 'getCustomer',
              arguments: { customer_id: 'c-42' },
              _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientInfo': { name: 'e2e-cli-init', version: '1.0' },
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

  it('refuses to overwrite an existing file without --force', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-init-'));
    const configPath = join(dir, 'mcp.config.json');
    expect(runCli(['init', '--spec', SPEC_PATH, '--out', configPath]).status).toBe(0);

    const second = runCli(['init', '--spec', SPEC_PATH, '--out', configPath]);
    expect(second.status).toBe(1);
    expect(second.stdout).toBe('');

    expect(runCli(['init', '--spec', SPEC_PATH, '--out', configPath, '--force']).status).toBe(0);
  });

  it('an OAuth2 scheme with only an authorizationCode flow warns on stderr, writes no auth block, and exits 0', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-init-'));
    const specPath = join(dir, 'oauth-spec.json');
    const configPath = join(dir, 'mcp.config.json');
    await writeFile(
      specPath,
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'OAuth API', version: '1' },
        paths: { '/x': { get: { operationId: 'getX', responses: { '200': { description: 'ok' } }, security: [{ oauth: [] }] } } },
        components: {
          securitySchemes: {
            oauth: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: 'https://example.com/authorize', tokenUrl: 'https://example.com/token', scopes: {} } } },
          },
        },
      }),
    );

    const result = runCli(['init', '--spec', specPath, '--out', configPath]);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('oauth');
    expect(result.stderr.toLowerCase()).toContain('not seeded');

    const config = JSON.parse(await readFile(configPath, 'utf8'));
    expect(config.upstreamAuthentication).toBeUndefined();
  });
});
