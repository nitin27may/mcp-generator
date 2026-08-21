import { resolveBindingValues, type BindingResolutionContext } from '@mcpgen/binding-engine';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';
import type { McpAccessConfig } from '@mcpgen/mcp-protocol';

/**
 * Turns the `mcpAccess` config block into the plain, already-resolved shape the protocol
 * adapter takes (ADR-0005 Plane A).
 *
 * The split matters: `mcp-protocol` deals in URLs and tokens, never in bindings or
 * environment lookups, so an issuer that lives in an env var is resolved here — beside
 * every other startup binding, failing the same way and producing the same diagnostics.
 */
export interface McpAccessResolution {
  readonly access?: McpAccessConfig;
  readonly diagnostics: Diagnostic[];
}

export async function resolveMcpAccess(
  config: McpProjectConfig,
  ctx: BindingResolutionContext,
): Promise<McpAccessResolution> {
  const access = config.mcpAccess;
  if (!access || access.mode === 'none') return { diagnostics: [] };

  const bindings = {
    issuer: access.issuer,
    resource: access.resource,
    ...(access.jwksUri ? { jwksUri: access.jwksUri } : {}),
  };
  const resolution = await resolveBindingValues(bindings, ctx);
  const diagnostics = [...resolution.diagnostics];

  const { issuer, resource, jwksUri } = resolution.values;
  // A partially-resolved access block must not silently degrade into an open endpoint:
  // the caller treats a missing `access` as "no authorization configured". Returning
  // undefined here is only safe because the diagnostics are errors that stop startup.
  if (issuer === undefined || resource === undefined) return { diagnostics };

  return {
    access: {
      issuer,
      resource,
      ...(access.audience ? { audience: access.audience } : {}),
      ...(jwksUri !== undefined ? { jwksUri } : {}),
      ...(access.requiredScopes ? { requiredScopes: access.requiredScopes } : {}),
      ...(access.dangerouslyAllowInsecureIssuer ? { dangerouslyAllowInsecureIssuer: true } : {}),
      resourceName: config.project.name,
    },
    diagnostics,
  };
}

/**
 * SEC-006 — an HTTP transport reachable beyond loopback with no Plane A authorization.
 *
 * ADR-0005 and docs/RISKS.md (R11) both cite this code; until now nothing emitted it.
 * A warning rather than an error, because binding a protected network is a deployment
 * decision this process cannot second-guess — but a silent one would be indefensible.
 */
export function checkAccessPosture(
  config: McpProjectConfig,
  transport: 'stdio' | 'http',
  host: string | undefined,
): Diagnostic[] {
  if (transport !== 'http') return [];
  const bound = host ?? '127.0.0.1';
  const loopback = bound === '127.0.0.1' || bound === 'localhost' || bound === '::1' || bound === '[::1]';
  if (loopback) return [];
  if (config.mcpAccess && config.mcpAccess.mode !== 'none') return [];

  return [
    {
      severity: 'warning',
      code: 'SEC-006',
      message:
        `serving MCP over HTTP on ${bound} with no mcpAccess configuration — every tool on this server is callable by anyone who can reach the port. ` +
        `Configure mcpAccess (ADR-0005) or bind loopback only.`,
    },
  ];
}
