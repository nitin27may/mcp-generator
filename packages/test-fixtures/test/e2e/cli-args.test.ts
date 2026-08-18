import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { startFixtureApi } from '../../src/fixture-api.js';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/cli.js', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

function runCli(args: string[], env?: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', ...(env ? { env } : {}) });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('CLI — --help/--version and usage errors, against the real spawned entrypoint', () => {
  it('--help exits 0 and prints usage to stdout', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: mcpgen <command> [flags]');
  });

  it('a specific command\'s --help exits 0 and prints that command\'s flags', () => {
    const result = runCli(['serve', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--transport');
  });

  it('--version exits 0 and prints a version string to stdout', () => {
    const result = runCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('an unknown flag exits 2 with empty stdout', () => {
    const result = runCli(['serve', '--frobnicate', 'x']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unknown flag "--frobnicate"');
  });

  it('an unknown command exits 2 with empty stdout', () => {
    const result = runCli(['frobnicate']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  });
});

describe('CLI — --dotenv, against the real spawned entrypoint', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('resolves a secret from an env file that is absent from the real environment', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-args-'));
    const envFile = join(dir, '.env');
    await writeFile(envFile, 'CUSTOMER_API_URL=https://api.example.com\nCUSTOMER_API_KEY=sk-from-env-file\n');

    const result = runCli(['validate', '--config', CONFIG_PATH, '--spec', SPEC_PATH, '--dotenv', envFile], {});

    expect(result.status, result.stderr).toBe(0);
  });

  it('never overrides a value already present in the real environment — the real key reaches the upstream request, not the file\'s', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-e2e-cli-args-'));
    const envFile = join(dir, '.env');
    await writeFile(envFile, 'CUSTOMER_API_KEY=sk-from-file-should-be-ignored\n');

    const api = await startFixtureApi({ expectedToken: 'sk-from-real-env' });
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      child = spawn(process.execPath, [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH, '--dotenv', envFile], {
        env: { CUSTOMER_API_URL: api.baseUrl, CUSTOMER_API_KEY: 'sk-from-real-env' },
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
                  'io.modelcontextprotocol/clientInfo': { name: 'e2e-env-file-precedence', version: '1.0' },
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              },
            })}\n`,
          );
        }, 300);
      });

      const result = response.result as { isError?: boolean };
      expect(result.isError).toBeFalsy();
      expect(api.requests.at(-1)!.headers.authorization).toBe('Bearer sk-from-real-env');
    } finally {
      child?.kill();
      await api.stop();
    }
  }, 15_000);

  it('exits 2 when the env file does not exist, rather than silently proceeding', () => {
    const result = runCli(['validate', '--config', CONFIG_PATH, '--spec', SPEC_PATH, '--dotenv', '/nonexistent/.env']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('/nonexistent/.env');
  });
});
