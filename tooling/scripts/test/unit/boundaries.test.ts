import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../boundaries.mjs', import.meta.url));

let workspace: string | undefined;

/** Build a throwaway workspace so the checker can be pointed at deliberate violations. */
function makeWorkspace(
  packages: Record<string, { manifest: Record<string, unknown>; files?: Record<string, string> }>,
): string {
  workspace = mkdtempSync(join(tmpdir(), 'boundaries-'));
  for (const [name, { manifest, files }] of Object.entries(packages)) {
    const dir = join(workspace, 'packages', name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@mcpgen/${name}`, ...manifest }));
    for (const [file, contents] of Object.entries(files ?? {})) {
      writeFileSync(join(dir, 'src', file), contents);
    }
  }
  return workspace;
}

/** @returns stderr on failure, or null when the checker passed. */
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

describe('boundaries checker', () => {
  it('passes a clean workspace', () => {
    const root = makeWorkspace({
      domain: { manifest: {}, files: { 'index.ts': 'export const VERSION = "1.0";\n' } },
      'mcp-protocol': {
        manifest: { dependencies: { '@modelcontextprotocol/server': '2.0.0' } },
        files: { 'index.ts': 'import { McpServer } from "@modelcontextprotocol/server";\nexport { McpServer };\n' },
      },
    });
    expect(run(root)).toBeNull();
  });

  // Each case below is a rule that must fail. If any of these ever passes, the
  // corresponding ADR has lost its enforcement and is back to being a comment.
  it.each([
    {
      rule: 'domain-pure',
      packages: { domain: { manifest: { dependencies: { zod: '^4' } } } },
    },
    {
      rule: 'parser-confined',
      packages: {
        'readiness-engine': { manifest: { dependencies: { '@scalar/openapi-parser': '^0.28.14' } } },
      },
    },
    {
      rule: 'sdk-confined',
      packages: {
        'upstream-http': {
          manifest: {},
          files: { 'x.ts': 'import { McpServer } from "@modelcontextprotocol/server";\nexport { McpServer };\n' },
        },
      },
    },
    {
      rule: 'auth-planes-separate',
      packages: {
        'upstream-auth': { manifest: { dependencies: { '@mcpgen/mcp-protocol': 'workspace:*' } } },
      },
    },
    {
      rule: 'analysis-pure',
      packages: { 'risk-engine': { manifest: { devDependencies: { react: '^19' } } } },
    },
    {
      rule: 'contracts-pure',
      packages: { 'control-contracts': { manifest: { dependencies: { next: '^16' } } } },
    },
    {
      rule: 'modern-era-only',
      packages: {
        'mcp-protocol': {
          manifest: { dependencies: { '@modelcontextprotocol/server': '2.0.0' } },
          files: {
            'legacy.ts':
              'import { McpServer } from "@modelcontextprotocol/server";\n' +
              'import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";\n' +
              'const s = new McpServer({ name: "x", version: "1" });\n' +
              'await s.connect(new StdioServerTransport());\n',
          },
        },
      },
    },
  ])('rejects $rule', ({ rule, packages }) => {
    const stderr = run(makeWorkspace(packages as never));
    expect(stderr, `${rule} should have been reported`).not.toBeNull();
    expect(stderr).toContain(`[${rule}]`);
  });

  it('does not flag a test-only import against domain-pure', () => {
    // vitest never ships in dist/; a *.test.ts importing it is not a production
    // dependency and must not trip the zero-dependency invariant.
    const root = makeWorkspace({
      domain: {
        manifest: {},
        files: {
          'index.ts': 'export const VERSION = "1.0";\n',
          'index.test.ts': 'import { describe } from "vitest";\ndescribe("x", () => {});\n',
        },
      },
    });
    expect(run(root)).toBeNull();
  });

  it('still rejects domain-pure for a production (non-test) import', () => {
    const root = makeWorkspace({
      domain: { manifest: {}, files: { 'index.ts': 'import { z } from "zod";\nexport { z };\n' } },
    });
    const stderr = run(root);
    expect(stderr).toContain('[domain-pure]');
  });

  it('allows a deliberate legacy fixture via the opt-out marker', () => {
    const root = makeWorkspace({
      'mcp-protocol': {
        manifest: { dependencies: { '@modelcontextprotocol/server': '2.0.0' } },
        files: {
          'legacy-fixture.ts':
            '// @boundaries-allow modern-era-only — exercises the legacy era on purpose\n' +
            'import { McpServer } from "@modelcontextprotocol/server";\n' +
            'import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";\n' +
            'const s = new McpServer({ name: "x", version: "1" });\n' +
            'await s.connect(new StdioServerTransport());\n',
        },
      },
    });
    expect(run(root)).toBeNull();
  });
});
