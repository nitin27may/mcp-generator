import process from 'node:process';
import { buildToolRegistry } from '@mcpgen/mcp-runtime';
import { createLogger } from '@mcpgen/redaction';
import { loadProject } from '../load-project.js';

export function runPrintTools(configPath: string, manifestPath: string): number {
  const logger = createLogger();
  const project = loadProject(configPath, manifestPath);

  for (const diagnostic of project.diagnostics) {
    (diagnostic.severity === 'error' ? logger.error : logger.warn)(diagnostic.message, { code: diagnostic.code });
  }
  if (!project.value) return 1;

  const { tools, diagnostics } = buildToolRegistry(project.value.config, project.value.operations, {
    baseUrl: 'placeholder://unused-for-listing',
    getEnv: () => undefined,
    resolveSecret: async () => undefined,
  });
  for (const diagnostic of diagnostics) logger.error(diagnostic.message, { code: diagnostic.code });
  if (diagnostics.some((d) => d.severity === 'error')) return 1;

  const summary = tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return 0;
}
