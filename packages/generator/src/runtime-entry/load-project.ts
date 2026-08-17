import { readFileSync } from 'node:fs';
import { parseProjectConfig, type McpProjectConfig } from '@mcpgen/config-schema';
import { stageFail, stageOk, type CanonicalOperation, type StageResult } from '@mcpgen/domain';

export interface LoadedProject {
  readonly config: McpProjectConfig;
  readonly operations: Readonly<Record<string, CanonicalOperation>>;
}

/**
 * The generated package's counterpart to apps/cli's load-project.ts —
 * deliberately does NOT depend on openapi-adapter or @scalar/openapi-parser.
 * Self-contained mode bakes the referenced operations into
 * generated-manifest.json at generation time (TIP §29's "generator emits a
 * manifest, not per-operation logic"), so the shipped package never
 * re-parses OpenAPI at runtime.
 */
export function loadProject(configPath: string, manifestPath: string): StageResult<LoadedProject> {
  let configRaw: unknown;
  try {
    configRaw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return stageFail([{ severity: 'error', code: 'CFG-001', message: `Failed to read/parse config at "${configPath}": ${(error as Error).message}` }]);
  }

  const configResult = parseProjectConfig(configRaw);
  if (!configResult.value) return stageFail(configResult.diagnostics);

  let manifestRaw: { operations?: CanonicalOperation[] };
  try {
    manifestRaw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return stageFail([{ severity: 'error', code: 'CFG-001', message: `Failed to read/parse manifest at "${manifestPath}": ${(error as Error).message}` }]);
  }

  const operations: Record<string, CanonicalOperation> = {};
  for (const operation of manifestRaw.operations ?? []) operations[operation.id] = operation;

  return stageOk({ config: configResult.value, operations }, configResult.diagnostics);
}
