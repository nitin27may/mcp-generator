import process from 'node:process';
import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import { serveToolsOverHttp, serveToolsOverStdio } from '@mcpgen/mcp-protocol';
import { buildToolRegistry, validateStartupRequirements } from '@mcpgen/mcp-runtime';
import { createLogger } from '@mcpgen/redaction';
import { EnvironmentSecretProvider } from '@mcpgen/upstream-auth';
import { loadProject } from '../load-project.js';
import { logDiagnostic } from '../log-diagnostic.js';

export interface ServeOptions {
  readonly transport: 'stdio' | 'http';
  readonly host?: string;
  readonly port?: number;
}

/**
 * BR-009 / TIP §33: every failure path here returns before either transport
 * ever starts. All of this command's own diagnostics go through `logger`,
 * which is stderr-only regardless of transport (redaction's `createLogger`,
 * per TIP §25.2) — one invariant instead of a transport-conditional one.
 */
export async function runServe(configPath: string, specPath: string, options: ServeOptions): Promise<number> {
  const logger = createLogger();

  const project = await loadProject(configPath, specPath);
  const loadErrors = project.diagnostics.filter((d) => d.severity === 'error');
  for (const diagnostic of project.diagnostics) logDiagnostic(logger, diagnostic);
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

  const serverInfo = { name: config.project.name, version: config.generation.version };
  const onError = (error: Error) => logger.error('transport error', { message: error.message });

  if (options.transport === 'stdio') {
    const handle = serveToolsOverStdio(tools, serverInfo, { onError });
    logger.info('serving', { tools: tools.length, transport: 'stdio' });
    return waitForShutdown(logger, () => handle.close());
  }

  const handle = await serveToolsOverHttp(tools, serverInfo, {
    onError,
    ...(options.host ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
  });
  logger.info('serving', { tools: tools.length, transport: 'http', url: handle.url });
  return waitForShutdown(logger, () => handle.close());
}

function waitForShutdown(logger: ReturnType<typeof createLogger>, close: () => Promise<void>): Promise<number> {
  return new Promise<number>((resolve) => {
    let shuttingDown = false;
    const shutdown = (reason: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('shutting down', { reason });
      void close().then(() => resolve(0));
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    // TIP §25.3: exit promptly on stdin EOF (stdio's graceful-shutdown
    // signal). Harmless to also listen for it in HTTP mode — a CLI invoked
    // with piped/closed stdin shutting down cleanly is reasonable there too.
    process.stdin.once('end', () => shutdown('stdin-eof'));
  });
}
