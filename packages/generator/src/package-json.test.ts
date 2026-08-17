import { describe, expect, it } from 'vitest';
import { buildPackageJson } from './package-json.js';
import { config } from './test-helpers.js';

describe('buildPackageJson', () => {
  it('uses the user-supplied package name and bin name verbatim — never a house scope (BR-011)', () => {
    const pkg = buildPackageJson(config()) as { name: string; bin: Record<string, string> };
    expect(pkg.name).toBe('@acme/customer-mcp');
    expect(pkg.bin).toEqual({ 'customer-mcp': './dist/cli.mjs' });
  });

  it('never appears with a @mcpgen scope anywhere in the output', () => {
    const pkg = buildPackageJson(config());
    expect(JSON.stringify(pkg)).not.toContain('@mcpgen');
  });

  it('always includes all four real SDK dependencies, even for a stdio-only config', () => {
    // mcp-protocol's barrel always pulls in @modelcontextprotocol/node
    // transitively (serve-http.ts), regardless of which transports the
    // project config declares — found by running a stdio-only generated
    // package and watching module resolution fail.
    const pkg = buildPackageJson(config({ generation: { ...config().generation, transports: ['stdio'] } })) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@modelcontextprotocol/core', '@modelcontextprotocol/node', '@modelcontextprotocol/server', 'zod']);
  });

  it('omits the license field when the user supplied none (OQ-07) — never defaults', () => {
    const pkg = buildPackageJson(config()) as Record<string, unknown>;
    expect(pkg).not.toHaveProperty('license');
  });

  it('includes the license field verbatim when the user supplied one', () => {
    const withLicense = config({ generation: { ...config().generation, license: 'MIT' } });
    const pkg = buildPackageJson(withLicense) as { license: string };
    expect(pkg.license).toBe('MIT');
  });

  it('sets engines.node to match the workspace-wide Node LTS requirement', () => {
    const pkg = buildPackageJson(config()) as { engines: { node: string } };
    expect(pkg.engines.node).toBe('>=22.11');
  });
});
