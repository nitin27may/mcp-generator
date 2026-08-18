import { generateProject } from '@mcpgen/generator';
import { createLogger } from '@mcpgen/redaction';
import { loadProject } from '../load-project.js';
import { logDiagnostic } from '../log-diagnostic.js';

/** Turns a config + spec into a redistributable MCP server package — the CLI's half of the "same generateProject() call, two front doors" story shared with the web app's /generate step. */
export async function runGenerate(configPath: string, specPath: string, outDir: string): Promise<number> {
  const logger = createLogger();
  const project = await loadProject(configPath, specPath);

  for (const diagnostic of project.diagnostics) logDiagnostic(logger, diagnostic);
  if (!project.value) return 1;

  const { config, operations } = project.value;
  const result = await generateProject({ config, operations }, outDir);

  for (const diagnostic of result.diagnostics) logDiagnostic(logger, diagnostic);
  if (!result.outputDir) return 1;

  logger.info('generated', { outputDir: result.outputDir, tools: Object.keys(config.tools).filter((k) => config.tools[k]?.enabled).length });
  return 0;
}
