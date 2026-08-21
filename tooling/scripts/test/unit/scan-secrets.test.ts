import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scan-secrets.mjs', import.meta.url));

let workspace: string | undefined;

/** Build a throwaway tree so the scanner can be pointed at deliberate leaks. */
function makeWorkspace(files: Record<string, string>): string {
  workspace = mkdtempSync(join(tmpdir(), 'scan-secrets-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = join(workspace, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return workspace;
}

/** @returns stderr on failure, or null when the scan passed. */
function run(root: string): string | null {
  try {
    execFileSync(process.execPath, [SCRIPT, '--root', root, '--quiet'], { encoding: 'utf8', stdio: 'pipe' });
    return null;
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? '');
  }
}

afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe('secret-literal scanner', () => {
  it('passes a tree with no credential-shaped literals', () => {
    const root = makeWorkspace({
      'packages/thing/src/index.ts': 'export const baseUrl = "https://api.example.com";\n',
    });
    expect(run(root)).toBeNull();
  });

  it('rejects a credential literal in production source', () => {
    const root = makeWorkspace({
      'packages/thing/src/client.ts': 'const apiKey = "AKIAIOSFODNN7QQQQQQQ";\n',
    });
    const stderr = run(root);
    expect(stderr).toContain('credential-shaped literal outside a test file');
    expect(stderr).toContain('packages/thing/src/client.ts');
  });

  it('rejects a credential literal in production source even when it looks like a sentinel', () => {
    // The sentinel allowance is for test files only — production code carries no
    // credential literals at all, however obviously fake they look.
    const root = makeWorkspace({
      'packages/thing/src/client.ts': 'const token = "sk-obviously-fake-value";\n',
    });
    expect(run(root)).toContain('credential-shaped literal outside a test file');
  });

  it('allows a sentinel-marked credential in a test file', () => {
    const root = makeWorkspace({
      'packages/thing/src/client.test.ts': 'const apiKey = "sk-unit-sentinel";\n',
    });
    expect(run(root)).toBeNull();
  });

  it('rejects an unmarked credential in a test file', () => {
    const root = makeWorkspace({
      'packages/thing/src/client.test.ts': 'const token = "ghp_looksEntirelyReal12345";\n',
    });
    expect(run(root)).toContain('test credential without a sentinel marker');
  });

  it('treats SCREAMING_SNAKE values as environment variable names, not secrets', () => {
    // packages/config-seed is full of these by design: they are the *names* of the
    // variables a generated server reads, never the values.
    const root = makeWorkspace({
      'packages/thing/src/slug.ts': 'export const names = { apiKey: "CUSTOMER_API_KEY" };\n',
    });
    expect(run(root)).toBeNull();
  });

  it('ignores build output and dependencies', () => {
    const root = makeWorkspace({
      'packages/thing/dist/index.js': 'const apiKey = "AKIAIOSFODNN7QQQQQQQ";\n',
      'packages/thing/node_modules/dep/index.js': 'const secret = "AKIAIOSFODNN7QQQQQQQ";\n',
    });
    expect(run(root)).toBeNull();
  });

  it('scans fixtures and docs, which are not test files', () => {
    const root = makeWorkspace({
      'fixtures/sample.json': '{ "password": "hunter2hunter2" }\n',
    });
    expect(run(root)).toContain('credential-shaped literal outside a test file');
  });
});
