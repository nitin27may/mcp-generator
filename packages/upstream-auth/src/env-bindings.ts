import type { McpProjectConfig, ValueBinding } from '@mcpgen/config-schema';
import { authBindingsOf } from './auth-bindings.js';

/**
 * Every `environment`/`secret` binding a config actually depends on at run time — base URL,
 * both authentication planes, and every *enabled* tool's bindings. Disabled tools are excluded deliberately:
 * a name here is a promise ("you need to set this to run"), and a variable the server will never
 * read because its tool is off is noise, not a promise.
 *
 * The single implementation of this walk. It used to be three — `env-example.ts`,
 * `readme.ts`, and `env-summary.ts` each re-derived it, and `env-example.ts` disagreed with the
 * other two on the enabled-tool question, so a generated `.env.example` could list names its own
 * README and the wizard's config-preview panel both omitted.
 */
export interface ConfigEnvBinding {
  readonly name: string;
  readonly sensitive: boolean;
  readonly required: boolean;
  readonly usedByToolCount: number;
  readonly usedByBaseUrl: boolean;
  /** Plane B — the credential this server presents upstream. */
  readonly usedByAuth: boolean;
  /** Plane A — who may call this server. Kept distinct from `usedByAuth`: ADR-0005's
   *  whole point is that these are different credentials with different blast radii. */
  readonly usedByMcpAccess: boolean;
}

interface MutableEntry {
  name: string;
  sensitive: boolean;
  required: boolean;
  usedByToolCount: number;
  usedByBaseUrl: boolean;
  usedByAuth: boolean;
  usedByMcpAccess: boolean;
}

function record(
  entries: Map<string, MutableEntry>,
  binding: ValueBinding,
  options: { usedByBaseUrl?: boolean; usedByAuth?: boolean; usedByTool?: boolean; usedByMcpAccess?: boolean },
): void {
  if (binding.source !== 'environment' && binding.source !== 'secret') return;

  const existing = entries.get(binding.name);
  const sensitive = binding.source === 'secret';
  const required = binding.source === 'secret' ? true : (binding.required ?? false);

  if (existing) {
    existing.sensitive = existing.sensitive || sensitive;
    existing.required = existing.required || required;
    existing.usedByBaseUrl = existing.usedByBaseUrl || (options.usedByBaseUrl ?? false);
    existing.usedByAuth = existing.usedByAuth || (options.usedByAuth ?? false);
    existing.usedByMcpAccess = existing.usedByMcpAccess || (options.usedByMcpAccess ?? false);
    if (options.usedByTool) existing.usedByToolCount += 1;
  } else {
    entries.set(binding.name, {
      name: binding.name,
      sensitive,
      required,
      usedByToolCount: options.usedByTool ? 1 : 0,
      usedByBaseUrl: options.usedByBaseUrl ?? false,
      usedByAuth: options.usedByAuth ?? false,
      usedByMcpAccess: options.usedByMcpAccess ?? false,
    });
  }
}

/** Deterministic order: sorted by name. */
export function collectConfigEnvBindings(config: McpProjectConfig): readonly ConfigEnvBinding[] {
  const entries = new Map<string, MutableEntry>();

  record(entries, config.api.baseUrl, { usedByBaseUrl: true });

  if (config.mcpAccess && config.mcpAccess.mode === 'oauth2') {
    record(entries, config.mcpAccess.issuer, { usedByMcpAccess: true });
    record(entries, config.mcpAccess.resource, { usedByMcpAccess: true });
    if (config.mcpAccess.jwksUri) record(entries, config.mcpAccess.jwksUri, { usedByMcpAccess: true });
  }

  if (config.upstreamAuthentication) {
    for (const binding of Object.values(authBindingsOf(config.upstreamAuthentication))) {
      record(entries, binding, { usedByAuth: true });
    }
  }

  for (const tool of Object.values(config.tools)) {
    if (!tool.enabled) continue;
    for (const binding of Object.values(tool.bindings)) {
      record(entries, binding, { usedByTool: true });
    }
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
