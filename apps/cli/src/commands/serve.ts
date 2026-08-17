import process from 'node:process';
import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import { serveToolsOverStdio } from '@mcpgen/mcp-protocol';
import { buildToolRegistry, validateStartupRequirements } from '@mcpgen/mcp-runtime';
import { createLogger } from '@mcpgen/redaction';
import { EnvironmentSecretProvider } from '@mcpgen/upstream-auth';
import { loadProject } from '../load-project.js';

/**
 * BR-009 / TIP §33: every failure path here returns before anything reaches
 * `serveToolsOverStdio` — nothing is written to stdout until the transport
 * itself starts, and the transport (mcp-protocol, wrapping the SDK) is the
 * only thing that ever writes to stdout after that. All of this command's
 * own diagnostics go through `logger`, which is stderr-only (redaction's
 * `createLogger`, per TIP §25.2).
 */
export async function runServe(configPath: string, specPath: string): Promise<number> {
  const logger = createLogger();

  const project = await loadProject(configPath, specPath);
  const loadErrors = project.diagnostics.filter((d) => d.severity === 'error');
  for (const diagnostic of project.diagnostics) {
    (diagnostic.severity === 'error' ? logger.error : logger.warn)(diagnostic.message, { code: diagnostic.code });
  }
  if (!project.value || loadErrors.length > 0) return 1;

  const { config, operations } = project.value;
  const secretProvider = new EnvironmentSecretProvider({ logger });
  const ctx: BindingResolutionContext = {
    toolInput: {},
    getEnv: (name) => process.env[name],
    resolveSecret: (name) => secretProvider.get(name),
  };

  const startup = await validateStartupRequirements(config, ctx);
  const startupErrors = startup.diagnostics.filter((d) => d.severity === 'error');
  if (startupErrors.length > 0 || !startup.baseUrl) {
    for (const diagnostic of startup.diagnostics) logger.error(diagnostic.message, { code: diagnostic.code });
    return 1;
  }

  const { tools, diagnostics: registryDiagnostics } = buildToolRegistry(config, operations, {
    baseUrl: startup.baseUrl,
    getEnv: (name) => process.env[name],
    resolveSecret: (name) => secretProvider.get(name),
  });
  const registryErrors = registryDiagnostics.filter((d) => d.severity === 'error');
  if (registryErrors.length > 0) {
    for (const diagnostic of registryDiagnostics) logger.error(diagnostic.message, { code: diagnostic.code });
    return 1;
  }

  const handle = serveToolsOverStdio(
    tools,
    { name: config.project.name, version: config.generation.version },
    { onError: (error) => logger.error('transport error', { message: error.message }) },
  );
  logger.info('serving', { tools: tools.length, transport: 'stdio' });

  return new Promise<number>((resolve) => {
    let shuttingDown = false;
    const shutdown = (reason: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('shutting down', { reason });
      void handle.close().then(() => resolve(0));
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    // TIP §25.3: exit promptly on stdin EOF — the primary, only portable
    // graceful-shutdown signal. Belt-and-suspenders alongside whatever
    // serveStdio does internally for the same signal.
    process.stdin.once('end', () => shutdown('stdin-eof'));
  });
}
