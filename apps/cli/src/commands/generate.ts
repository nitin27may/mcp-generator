import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProject } from '@mcpgen/generator';
import { createLogger } from '@mcpgen/redaction';
import { loadProject } from '../load-project.js';
import { logDiagnostic } from '../log-diagnostic.js';

/**
 * @mcpgen/generator's own bundled runtime asset ships as a direct sibling of this CLI's own
 * bundled output (apps/cli/scripts/build.mjs copies it there) — computed relative to THIS
 * module's own `import.meta.url` rather than trusting `@mcpgen/generator`'s default resolution
 * (bundle.ts's own doc comment explains why: once this module is inlined into the published CLI
 * bundle, `@mcpgen/generator`'s dist/ doesn't exist to resolve against at all).
 */
const RUNTIME_ASSET_PATH = join(dirname(fileURLToPath(import.meta.url)), 'runtime-cli.mjs');

/** Turns a config + spec into a redistributable MCP server package — the CLI's half of the "same generateProject() call, two front doors" story shared with the web app's /generate step. */
export async function runGenerate(configPath: string, specPath: string, outDir: string): Promise<number> {
  const logger = createLogger();
  const project = await loadProject(configPath, specPath);

  for (const diagnostic of project.diagnostics) logDiagnostic(logger, diagnostic);
  if (!project.value) return 1;

  const { config, operations } = project.value;
  const result = await generateProject({ config, operations }, outDir, { runtimeAssetPath: RUNTIME_ASSET_PATH });

  for (const diagnostic of result.diagnostics) logDiagnostic(logger, diagnostic);
  if (!result.outputDir) return 1;

  logger.info('generated', { outputDir: result.outputDir, tools: Object.keys(config.tools).filter((k) => config.tools[k]?.enabled).length });
  return 0;
}
