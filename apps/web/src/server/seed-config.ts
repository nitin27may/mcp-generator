import type { McpProjectConfig, ToolConfig, UpstreamAuthentication, ValueBinding } from '@mcpgen/config-schema';
import type { CanonicalApi, CanonicalOperation, CanonicalSecurityScheme } from '@mcpgen/domain';
import { classifyApi } from '@mcpgen/risk-engine';

function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'mcp-project';
}

function envName(slug: string, suffix: string): string {
  return `${slug.toUpperCase().replace(/-/g, '_')}_${suffix}`;
}

function sanitizeToolName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : '';
}

function pathSlug(path: string): string {
  return path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Every operation gets a name, even without an operationId — never leave a tool unnameable. */
function defaultToolName(op: CanonicalOperation): string {
  if (op.operationId) {
    const sanitized = sanitizeToolName(op.operationId);
    if (sanitized.length > 0) return sanitized;
  }
  return sanitizeToolName(`${op.method.toLowerCase()}_${pathSlug(op.path)}`) || `tool_${op.id}`;
}

function snakeCase(name: string): string {
  const converted = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '');
  return converted.length > 0 ? converted : 'value';
}

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

/**
 * OAuth2/OIDC schemes are deliberately NOT seeded — `OAuth2ClientCredentialsAuthSchema.tokenUrl`
 * is `z.string().url()` and cannot be seeded blank; a config born invalid at
 * creation time because of a guessed placeholder is worse than no seed at
 * all. The auth step (increment 5) lets the user configure it explicitly.
 */
function seedAuth(scheme: CanonicalSecurityScheme, slug: string): UpstreamAuthentication | undefined {
  switch (scheme.type) {
    case 'apiKey': {
      // cookie-based API keys aren't a binding kind config-schema supports (P0 scope) —
      // mis-mapping to header would silently produce a wrong config, so leave it unseeded.
      if (scheme.in === 'cookie') return undefined;
      return {
        type: 'apiKey',
        in: scheme.in ?? 'header',
        name: scheme.paramName ?? 'X-API-Key',
        value: { source: 'secret', name: envName(slug, 'API_KEY') },
      };
    }
    case 'http':
      if (scheme.scheme === 'basic') {
        return {
          type: 'basic',
          username: { source: 'environment', name: envName(slug, 'USERNAME') },
          password: { source: 'secret', name: envName(slug, 'PASSWORD') },
        };
      }
      // Treat any other HTTP scheme (bearer, or an unrecognized one) as bearer — the closest fit.
      return { type: 'bearer', token: { source: 'secret', name: envName(slug, 'TOKEN') } };
    case 'oauth2':
    case 'openIdConnect':
      return undefined;
  }
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
 * `CanonicalApi` -> a draft `McpProjectConfig` a user refines through the
 * rest of the wizard. Every tool starts disabled (name-uniqueness only
 * applies to enabled tools, BR-002, so seed-time name collisions between
 * disabled tools are harmless) and every binding starts as `tool-input` —
 * the least presumptuous default, since the platform can't know which
 * parameters should really be environment/secret/static without the user's
 * judgment (e.g. recommending `X-Tenant-ID` as environment/static rather
 * than a tool input is exactly the sort of call left to the binding step).
 */
export function seedProjectConfig(api: CanonicalApi, projectName: string): McpProjectConfig {
  const risk = classifyApi(api);
  const tools: Record<string, ToolConfig> = {};
  for (const op of api.operations) tools[op.id] = seedToolConfig(op, risk);

  const slug = slugify(projectName || api.info.title);
  const primaryScheme = api.securitySchemes[0];
  const upstreamAuthentication = primaryScheme ? seedAuth(primaryScheme, slug) : undefined;

  return {
    schemaVersion: '1.0',
    project: { name: projectName },
    api: { baseUrl: { source: 'environment', name: envName(slug, 'BASE_URL'), required: true } },
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
