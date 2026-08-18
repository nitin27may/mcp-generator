import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import {
  isValidBinName,
  isValidNpmPackageName,
  parseProjectConfig,
  type McpProjectConfig,
  type ToolConfig,
} from '@mcpgen/config-schema';
import { deriveEnvNames, seedAuth, seedProjectConfig, selectSeedableScheme, slugify } from '@mcpgen/config-seed';
import type { RiskClassification } from '@mcpgen/risk-engine';
import { collectConfigEnvBindings } from '@mcpgen/upstream-auth';
import { normalizeOpenApiSource, parseOpenApi } from '@mcpgen/openapi-adapter';
import { createLogger } from '@mcpgen/redaction';
import { logDiagnostic } from '../log-diagnostic.js';
import { collectInitWarnings, renderInitJson, renderInitSummary, suggestionFor, type InitAuthOutcome, type InitSummary } from '../init-summary.js';

export interface InitOptions {
  readonly name?: string;
  readonly packageName?: string;
  readonly binName?: string;
  readonly transport: 'stdio' | 'http';
  readonly enableReadOnly: boolean;
  readonly enableNames: readonly string[];
  readonly force: boolean;
  readonly json: boolean;
}

function emptyRiskCounts(): Record<RiskClassification, number> {
  return { READ_ONLY: 0, WRITE: 0, DESTRUCTIVE: 0, PRIVILEGED: 0, UNKNOWN: 0 };
}

/**
 * Derives a draft `mcp.config.json` from an OpenAPI/Swagger document — the CLI-only counterpart
 * to the web wizard's import step, using the exact same `@mcpgen/config-seed` a config-authoring
 * path a CLI-only user previously had no way to reach short of hand-writing every tool entry.
 *
 * Non-interactive by design: no TTY prompts, so it runs the same way in a terminal or in CI.
 * Every tool starts disabled (BR-006/ADR-0008 — nothing destructive or privileged is ever
 * auto-enabled) unless `--enable-read-only`/`--enable <name>` explicitly says otherwise, and
 * every auth scheme this platform can't confidently seed a complete config for is reported, never
 * guessed (a config with a placeholder `tokenUrl` that validates cleanly and fails at runtime with
 * a 401 is worse than no seed at all).
 */
export async function runInit(specPath: string, outPath: string, options: InitOptions): Promise<number> {
  const logger = createLogger();

  if (existsSync(outPath) && !options.force) {
    process.stderr.write(`Refusing to overwrite existing file "${outPath}" — pass --force to overwrite.\n`);
    return 1;
  }

  if (options.packageName !== undefined && !isValidNpmPackageName(options.packageName)) {
    process.stderr.write(`Invalid --package-name "${options.packageName}": must be a valid npm package name.\n`);
    return 2;
  }
  if (options.binName !== undefined && !isValidBinName(options.binName)) {
    process.stderr.write(`Invalid --bin-name "${options.binName}": must be a POSIX-portable command name.\n`);
    return 2;
  }

  let specRaw: unknown;
  try {
    specRaw = normalizeOpenApiSource(readFileSync(specPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`[IMP-003] Failed to read/parse "${specPath}": ${(error as Error).message}\n`);
    return 1;
  }

  const parsed = await parseOpenApi(specRaw, { sourceId: specPath });
  for (const diagnostic of parsed.diagnostics) logDiagnostic(logger, diagnostic);
  if (!parsed.value) return 1;
  const api = parsed.value;

  const projectName = options.name || api.info.title || 'Untitled project';
  const slug = slugify(projectName);
  const envNames = deriveEnvNames(slug);

  const { chosen, skipped } = selectSeedableScheme(api.securitySchemes);
  const authResult = chosen ? seedAuth(chosen, slug) : undefined;
  const auth: InitAuthOutcome =
    !chosen || !authResult
      ? { kind: 'none' }
      : authResult.kind === 'seeded'
        ? { kind: 'seeded', type: authResult.auth.type, schemeName: chosen.name }
        : { kind: 'unsupported', schemeName: chosen.name, reason: authResult.reason, suggestion: suggestionFor(authResult.reason) };

  const base = seedProjectConfig(api, projectName);

  const enableSet = new Set(options.enableNames);
  const matchedEnableNames = new Set<string>();
  const tools: Record<string, ToolConfig> = {};
  const toolsByRisk = emptyRiskCounts();
  for (const [key, tool] of Object.entries(base.tools)) {
    const enabledByRisk = options.enableReadOnly && tool.risk === 'READ_ONLY';
    const enabledByName = enableSet.has(tool.name);
    if (enabledByName) matchedEnableNames.add(tool.name);
    const enabled = enabledByRisk || enabledByName;
    tools[key] = { ...tool, enabled };
    if (enabled) toolsByRisk[tool.risk] += 1;
  }
  const unmatchedEnableNames = options.enableNames.filter((name) => !matchedEnableNames.has(name));

  const config: McpProjectConfig = {
    ...base,
    api: { baseUrl: { source: 'environment', name: envNames.baseUrl, required: true } },
    tools,
    generation: {
      ...base.generation,
      packageName: options.packageName ?? slug,
      binName: options.binName ?? slug,
      transports: [options.transport],
    },
  };

  // The safety net: init must never write something it wouldn't itself accept back. This is also
  // what catches an enabled-tool name collision (BR-002) — harmless while everything is disabled,
  // real the moment --enable-read-only/--enable turns some on.
  const validated = parseProjectConfig(config);
  if (!validated.value) {
    process.stderr.write('Refusing to write an invalid config:\n');
    for (const diagnostic of validated.diagnostics) logDiagnostic(logger, diagnostic);
    return 1;
  }

  writeFileSync(outPath, `${JSON.stringify(validated.value, null, 2)}\n`);

  const toolsEnabled = Object.values(tools).filter((t) => t.enabled).length;
  const summary: InitSummary = {
    outPath,
    projectName,
    slug,
    specPath,
    declaredVersion: `OpenAPI/Swagger, ${api.info.version || 'unknown version'}`,
    operationCount: api.operations.length,
    auth,
    skippedSchemes: skipped,
    toolsDiscovered: Object.keys(tools).length,
    toolsEnabled,
    toolsByRisk,
    unmatchedEnableNames,
    envVars: collectConfigEnvBindings(validated.value),
  };

  const warnings = collectInitWarnings(summary);
  for (const warning of warnings) process.stderr.write(`Warning: ${warning.message}\n`);

  process.stdout.write(options.json ? renderInitJson(summary, warnings) : `${renderInitSummary(summary)}\n`);
  return 0;
}

