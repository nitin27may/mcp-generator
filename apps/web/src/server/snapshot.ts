import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import type { McpProjectConfig, ValueBinding } from '@mcpgen/config-schema';
import type { CanonicalApi, CanonicalOperation } from '@mcpgen/domain';
import { computeGates, type GateInput, type ProjectSnapshot } from '@mcpgen/control-contracts';
import { validateStartupRequirements } from '@mcpgen/mcp-runtime';
import type { ProjectRecord, SourceVersionMeta } from './types';

function operationHasAllRequiredBindings(op: CanonicalOperation, bindings: Readonly<Record<string, ValueBinding>>): boolean {
  for (const param of op.parameters) {
    if (param.required && !(param.sourceName in bindings)) return false;
  }
  if (op.requestBody?.required && op.requestBody.schema.kind === 'inline') {
    const bodySchema = op.requestBody.schema.schema.schema as { required?: string[] };
    for (const propName of bodySchema.required ?? []) {
      if (!(propName in bindings)) return false;
    }
  }
  return true;
}

async function computeGateInput(config: McpProjectConfig, canonicalApi: CanonicalApi): Promise<GateInput> {
  const operationsById = new Map(canonicalApi.operations.map((op) => [op.id, op]));
  const enabledTools = Object.values(config.tools).filter((tool) => tool.enabled);

  let allEnabledToolsResolveToOperations = true;
  let allEnabledToolsHaveRequiredBindings = true;
  for (const tool of enabledTools) {
    const op = operationsById.get(tool.sourceOperation.internalOperationId);
    if (!op) {
      allEnabledToolsResolveToOperations = false;
      allEnabledToolsHaveRequiredBindings = false;
      continue;
    }
    if (!operationHasAllRequiredBindings(op, tool.bindings)) allEnabledToolsHaveRequiredBindings = false;
  }

  // Structural check only — no real env/secrets available at snapshot time, matching
  // apps/cli's `validate`/`print-tools` commands (placeholder deps, no network/secret access).
  const startupCtx: BindingResolutionContext = { toolInput: {}, getEnv: () => undefined, resolveSecret: async () => undefined };
  const startup = await validateStartupRequirements(config, startupCtx);

  return {
    importHasErrors: canonicalApi.diagnostics.some((d) => d.severity === 'error'),
    enabledToolCount: enabledTools.length,
    allEnabledToolsHaveRequiredBindings,
    configParses: true, // the on-disk config is always schema-valid by construction (checked before every write)
    allEnabledToolsResolveToOperations,
    startupValid: !startup.diagnostics.some((d) => d.severity === 'error'),
  };
}

/**
 * `ProjectRecord` + on-disk config/canonical -> the wire `ProjectSnapshot`.
 * Gates are always computed from full server-side knowledge, independent of
 * whatever the caller's `include=` query ends up serializing (TIP §51/§53).
 * `analysis`/`operations`/`operationDetail` land in later increments.
 */
export async function buildProjectSnapshot(
  record: ProjectRecord,
  config: McpProjectConfig,
  canonicalApi: CanonicalApi,
  sourceMeta: SourceVersionMeta,
): Promise<ProjectSnapshot> {
  const gates = computeGates(await computeGateInput(config, canonicalApi));

  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    configRevision: record.configRevision,
    source: {
      version: sourceMeta.version,
      format: sourceMeta.format,
      declaredVersion: sourceMeta.declaredVersion,
      rawFingerprint: sourceMeta.rawFingerprint,
      origin: sourceMeta.origin,
    },
    api: {
      info: canonicalApi.info,
      servers: canonicalApi.servers,
      securitySchemes: canonicalApi.securitySchemes,
      operationCount: canonicalApi.operations.length,
    },
    config,
    importDiagnostics: canonicalApi.diagnostics,
    gates,
  };
}
