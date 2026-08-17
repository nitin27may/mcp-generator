import { readFileSync } from 'node:fs';
import { parseProjectConfig, type McpProjectConfig } from '@mcpgen/config-schema';
import { stageFail, stageOk, type CanonicalOperation, type StageResult } from '@mcpgen/domain';
import { parseOpenApi } from '@mcpgen/openapi-adapter';

export interface LoadedProject {
  readonly config: McpProjectConfig;
  readonly operations: Readonly<Record<string, CanonicalOperation>>;
}

function readJson(path: string, code: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { error: `[${code}] Failed to read/parse "${path}": ${(error as Error).message}` };
  }
}

/**
 * Ties the two halves of the TIP §82 pipeline together: the portable config
 * (config-schema) and the canonical model (openapi-adapter). The portable
 * config schema deliberately doesn't carry a `source` reference at P0 (TIP
 * §11.1 trims that to P1's inheritance work) — the CLI is what knows a spec
 * and a config belong together, via `--config`/`--spec`.
 */
export async function loadProject(configPath: string, specPath: string): Promise<StageResult<LoadedProject>> {
  const configRead = readJson(configPath, 'CFG-001');
  if (configRead.error) {
    return stageFail([{ severity: 'error', code: 'CFG-001', message: configRead.error }]);
  }

  const configResult = parseProjectConfig(configRead.value);
  if (!configResult.value) return stageFail(configResult.diagnostics);

  const specRead = readJson(specPath, 'IMP-003');
  if (specRead.error) {
    return stageFail([{ severity: 'error', code: 'IMP-003', message: specRead.error }]);
  }

  const specResult = await parseOpenApi(specRead.value, { sourceId: specPath });
  if (!specResult.value) return stageFail([...configResult.diagnostics, ...specResult.diagnostics]);

  const operations: Record<string, CanonicalOperation> = {};
  for (const operation of specResult.value.operations) operations[operation.id] = operation;

  return stageOk({ config: configResult.value, operations }, [...configResult.diagnostics, ...specResult.diagnostics]);
}
