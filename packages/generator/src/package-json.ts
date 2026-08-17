import type { McpProjectConfig } from '@mcpgen/config-schema';

/**
 * Self-contained mode only (TIP §29/§30): `@mcpgen/*` packages are not
 * published, so "thin mode" — depending on a published runtime — cannot
 * produce anything actually installable outside this monorepo. The
 * generated package instead bundles our runtime code directly (bundle.ts)
 * and depends only on the real, published SDK packages plus zod.
 */
export function buildPackageJson(config: McpProjectConfig): Record<string, unknown> {
  const { generation } = config;
  // Always all four, regardless of `transports`: mcp-protocol's barrel
  // exports both serveToolsOverStdio and serveToolsOverHttp from one
  // module, so bundling the CLI always pulls in @modelcontextprotocol/node
  // transitively (serve-http.ts imports it at module scope) even for a
  // stdio-only config — found by actually running a stdio-only generated
  // package and watching it fail to resolve the import at startup.
  const dependencies: Record<string, string> = {
    '@modelcontextprotocol/core': '2.0.0',
    '@modelcontextprotocol/server': '2.0.0',
    '@modelcontextprotocol/node': '2.0.0',
    zod: '^4.4.3',
  };

  return {
    name: generation.packageName,
    version: generation.version,
    description: `Generated MCP server for ${config.project.name}`,
    type: 'module',
    bin: { [generation.binName]: './dist/cli.mjs' },
    main: './dist/cli.mjs',
    ...(generation.license ? { license: generation.license } : {}),
    files: ['dist', 'mcp.config.json', 'generated-manifest.json', 'README.md'],
    engines: { node: '>=22.11' },
    dependencies,
  };
}
