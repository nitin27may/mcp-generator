import type { McpProjectConfig, ToolConfig, ValueBinding } from '@mcpgen/config-schema';
import type { CanonicalApi, CanonicalOperation } from '@mcpgen/domain';
import { classifyApi } from '@mcpgen/risk-engine';
import { deriveEnvNames, slugify } from './slug.js';
import { defaultToolName, snakeCase } from './tool-naming.js';
import { seedAuth, selectSeedableScheme } from './seed-auth.js';

/** Every operation parameter and top-level request-body property becomes a `tool-input` binding, renamed to snake_case for the agent-facing name (FR-BIND-004). */
function seedBindings(op: CanonicalOperation): Record<string, ValueBinding> {
  const bindings: Record<string, ValueBinding> = {};

  for (const param of op.parameters) {
    bindings[param.sourceName] = { source: 'tool-input', inputName: snakeCase(param.sourceName) };
  }

  if (op.requestBody?.schema.kind === 'inline') {
    const bodySchema = op.requestBody.schema.schema.schema as { properties?: Record<string, unknown> };
    for (const propName of Object.keys(bodySchema.properties ?? {})) {
      bindings[propName] = { source: 'tool-input', inputName: snakeCase(propName) };
    }
  }

  return bindings;
}

function seedToolConfig(op: CanonicalOperation, risk: ReturnType<typeof classifyApi>): ToolConfig {
  return {
    enabled: false, // BR-006: never auto-enabled, including at seed time — the user curates the tool surface.
    sourceOperation: {
      internalOperationId: op.id,
      method: op.method,
      path: op.path,
      ...(op.operationId !== undefined ? { operationId: op.operationId } : {}),
    },
    name: defaultToolName(op),
    description: op.summary ?? op.description ?? `${op.method} ${op.path}`,
    bindings: seedBindings(op),
    risk: risk[op.id]?.classification ?? 'UNKNOWN',
  };
}

/**
 * `CanonicalApi` -> a draft `McpProjectConfig` a user refines through the rest of the wizard (or,
 * for a CLI-only user, via `mcpgen init`). Every tool starts disabled (name-uniqueness only
 * applies to enabled tools, BR-002, so seed-time name collisions between disabled tools are
 * harmless) and every binding starts as `tool-input` — the least presumptuous default, since the
 * platform can't know which parameters should really be environment/secret/static without the
 * user's judgment (e.g. recommending `X-Tenant-ID` as environment/static rather than a tool input
 * is exactly the sort of call left to the binding step).
 */
export function seedProjectConfig(api: CanonicalApi, projectName: string): McpProjectConfig {
  const risk = classifyApi(api);
  const tools: Record<string, ToolConfig> = {};
  for (const op of api.operations) tools[op.id] = seedToolConfig(op, risk);

  const slug = slugify(projectName || api.info.title);
  const { chosen } = selectSeedableScheme(api.securitySchemes);
  const authResult = chosen ? seedAuth(chosen, slug) : undefined;
  const upstreamAuthentication = authResult?.kind === 'seeded' ? authResult.auth : undefined;

  return {
    schemaVersion: '1.0',
    project: { name: projectName },
    api: { baseUrl: { source: 'environment', name: deriveEnvNames(slug).baseUrl, required: true } },
    ...(upstreamAuthentication ? { upstreamAuthentication } : {}),
    tools,
    generation: {
      packageName: slug,
      binName: slug,
      version: '0.1.0',
      transports: ['stdio'],
      emitDockerfile: false,
      mode: 'self-contained',
    },
  };
}
