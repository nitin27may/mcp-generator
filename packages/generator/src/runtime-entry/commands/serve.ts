import process from 'node:process';
import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import { createMcpAccessGate, serveToolsOverHttp, serveToolsOverStdio, type McpAccessGate } from '@mcpgen/mcp-protocol';
import { buildToolRegistry, checkAccessPosture, resolveMcpAccess, validateStartupRequirements } from '@mcpgen/mcp-runtime';
import { createLogger } from '@mcpgen/redaction';
import { EnvironmentSecretProvider, OAuthTokenProvider, TokenExchangeProvider } from '@mcpgen/upstream-auth';
import { loadProject } from '../load-project.js';

export interface ServeOptions {
  readonly transport: 'stdio' | 'http';
  readonly host?: string;
  readonly port?: number;
}

/** BR-009: identical discipline to apps/cli's serve command — every failure path returns before any transport starts; all diagnostics go to stderr. */
export async function runServe(configPath: string, manifestPath: string, options: ServeOptions): Promise<number> {
  const logger = createLogger();
  const project = loadProject(configPath, manifestPath);
  const loadErrors = project.diagnostics.filter((d) => d.severity === 'error');
  for (const diagnostic of project.diagnostics) {
    (diagnostic.severity === 'error' ? logger.error : logger.warn)(diagnostic.message, { code: diagnostic.code });
  }
  if (!project.value || loadErrors.length > 0) return 1;

  const { config, operations } = project.value;
  const secretProvider = new EnvironmentSecretProvider({ logger });
  // One instance for the process lifetime, matching apps/cli's own serve command — its token
  // cache only helps across calls if it survives between them. Its earlier absence here meant
  // every OAuth2 tool call in a generated server re-acquired a token from scratch.
  const oauthTokenProvider = new OAuthTokenProvider();
  // Same lifetime argument as above, and one more besides: this cache is keyed per
  // caller, so a per-call instance would re-exchange on every single tool invocation.
  const tokenExchangeProvider = new TokenExchangeProvider();
  const ctx: BindingResolutionContext = { toolInput: {}, getEnv: (name) => process.env[name], resolveSecret: (name) => secretProvider.get(name) };

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
    oauthTokenProvider,
    tokenExchangeProvider,
  });
  if (registryDiagnostics.some((d) => d.severity === 'error')) {
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

  // Plane A (ADR-0005), identical discipline to apps/cli's serve command: resolved and
  // constructed before the port opens, so a misconfigured authorization server fails with
  // nothing listening rather than leaving an endpoint up in an unknown state.
  const accessResolution = await resolveMcpAccess(config, ctx);
  for (const diagnostic of accessResolution.diagnostics) {
    (diagnostic.severity === 'error' ? logger.error : logger.warn)(diagnostic.message, { code: diagnostic.code });
  }
  if (accessResolution.diagnostics.some((d) => d.severity === 'error')) return 1;
  for (const diagnostic of checkAccessPosture(config, 'http', options.host)) {
    logger.warn(diagnostic.message, { code: diagnostic.code });
  }

  let access: McpAccessGate | undefined;
  if (accessResolution.access) {
    try {
      access = await createMcpAccessGate(accessResolution.access);
    } catch (error) {
      logger.error('mcpAccess configuration could not be initialised', {
        code: 'AUT-001',
        message: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  }

  const handle = await serveToolsOverHttp(tools, serverInfo, {
    onError,
    ...(options.host ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(access ? { access } : {}),
  });
  logger.info('serving', {
    tools: tools.length,
    transport: 'http',
    url: handle.url,
    authorization: access ? 'oauth2' : 'none',
  });
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
    process.stdin.once('end', () => shutdown('stdin-eof'));
  });
}
