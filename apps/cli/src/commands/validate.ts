import process from 'node:process';
import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import { buildToolRegistry, validateStartupRequirements } from '@mcpgen/mcp-runtime';
import { createLogger } from '@mcpgen/redaction';
import { EnvironmentSecretProvider } from '@mcpgen/upstream-auth';
import { loadProject } from '../load-project.js';
import { logDiagnostic } from '../log-diagnostic.js';

/** Checks everything `serve` would need, without starting a server: config shape, operation references, and — against the current environment — whether required secrets are actually available. */
export async function runValidate(configPath: string, specPath: string): Promise<number> {
  const logger = createLogger();
  const project = await loadProject(configPath, specPath);

  for (const diagnostic of project.diagnostics) logDiagnostic(logger, diagnostic);
  if (!project.value) return 1;

  const { config, operations } = project.value;

  const { diagnostics: registryDiagnostics } = buildToolRegistry(config, operations, {
    baseUrl: 'placeholder://unused-for-validation',
    getEnv: () => undefined,
    resolveSecret: async () => undefined,
  });
  for (const diagnostic of registryDiagnostics) logger.error(diagnostic.message, { code: diagnostic.code });

  const secretProvider = new EnvironmentSecretProvider({ logger });
  const ctx: BindingResolutionContext = {
    toolInput: {},
    getEnv: (name) => process.env[name],
    resolveSecret: (name) => secretProvider.get(name),
  };
  const startup = await validateStartupRequirements(config, ctx);
  for (const diagnostic of startup.diagnostics) logger.error(diagnostic.message, { code: diagnostic.code });

  const hasErrors = [...registryDiagnostics, ...startup.diagnostics].some((d) => d.severity === 'error');
  if (!hasErrors) logger.info('validation passed', { tools: Object.keys(config.tools).length });
  return hasErrors ? 1 : 0;
}
