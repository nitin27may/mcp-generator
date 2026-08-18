import type { McpProjectConfig, ValueBinding } from '@mcpgen/config-schema';

/** BRD §16's "configuration preview" — aggregated across `api.baseUrl`, `upstreamAuthentication`, and every *enabled* tool's bindings. Not a literal implementation of the BRD mockup's `type`/`default` columns — this build can't honestly infer a semantic type for every binding, so it sticks to what's structurally knowable: name, required, sensitive, and where it's used. */
export interface EnvVarSummaryEntry {
  readonly name: string;
  readonly sensitive: boolean;
  readonly required: boolean;
  readonly usedByToolCount: number;
  readonly usedByBaseUrl: boolean;
  readonly usedByAuth: boolean;
}

interface MutableEntry {
  name: string;
  sensitive: boolean;
  required: boolean;
  usedByToolCount: number;
  usedByBaseUrl: boolean;
  usedByAuth: boolean;
}

function record(entries: Map<string, MutableEntry>, binding: ValueBinding, options: { usedByBaseUrl?: boolean; usedByAuth?: boolean; usedByTool?: boolean }): void {
  if (binding.source !== 'environment' && binding.source !== 'secret') return;

  const existing = entries.get(binding.name);
  const sensitive = binding.source === 'secret';
  const required = binding.source === 'secret' ? true : (binding.required ?? false);

  if (existing) {
    existing.sensitive = existing.sensitive || sensitive;
    existing.required = existing.required || required;
    existing.usedByBaseUrl = existing.usedByBaseUrl || (options.usedByBaseUrl ?? false);
    existing.usedByAuth = existing.usedByAuth || (options.usedByAuth ?? false);
    if (options.usedByTool) existing.usedByToolCount += 1;
  } else {
    entries.set(binding.name, {
      name: binding.name,
      sensitive,
      required,
      usedByToolCount: options.usedByTool ? 1 : 0,
      usedByBaseUrl: options.usedByBaseUrl ?? false,
      usedByAuth: options.usedByAuth ?? false,
    });
  }
}

/** Every `environment`/`secret` binding this project actually depends on. Deterministic order: sorted by name. */
export function buildEnvVarSummary(config: McpProjectConfig): readonly EnvVarSummaryEntry[] {
  const entries = new Map<string, MutableEntry>();

  record(entries, config.api.baseUrl, { usedByBaseUrl: true });

  const auth = config.upstreamAuthentication;
  if (auth) {
    switch (auth.type) {
      case 'apiKey':
        record(entries, auth.value, { usedByAuth: true });
        break;
      case 'bearer':
        record(entries, auth.token, { usedByAuth: true });
        break;
      case 'basic':
        record(entries, auth.username, { usedByAuth: true });
        record(entries, auth.password, { usedByAuth: true });
        break;
      case 'oauth2ClientCredentials':
        record(entries, auth.clientId, { usedByAuth: true });
        record(entries, auth.clientSecret, { usedByAuth: true });
        break;
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
