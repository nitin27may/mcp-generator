import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI_ENTRY = fileURLToPath(new URL('../../../../apps/cli/dist/mcpgen.mjs', import.meta.url));
const CONFIG_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.mcp.config.json', import.meta.url));
const SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

function runServeWithEnv(env: Record<string, string>): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRY, 'serve', '--config', CONFIG_PATH, '--spec', SPEC_PATH], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

/** BR-009 / TIP §33 — the failure path is exactly as disciplined as the success path. */
describe('CLI `serve` — fails fast on missing configuration (P0-W25-T04 partial)', () => {
  it('exits non-zero, writes NOTHING to stdout, and names the missing secret on stderr', async () => {
    const { exitCode, stdout, stderr } = await runServeWithEnv({});

    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('CUSTOMER_API_URL');
    expect(stderr).toContain('CUSTOMER_API_KEY');
  });

  it('exits non-zero with only the base URL missing', async () => {
    const { exitCode, stdout, stderr } = await runServeWithEnv({ CUSTOMER_API_KEY: 'sk-present' });
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('CUSTOMER_API_URL');
  });

  it('exits non-zero when only the secret is missing', async () => {
    const { exitCode, stdout, stderr } = await runServeWithEnv({ CUSTOMER_API_URL: 'https://api.example.com' });
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('CUSTOMER_API_KEY');
  });
});
