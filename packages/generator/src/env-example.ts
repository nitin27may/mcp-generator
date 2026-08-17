import type { McpProjectConfig, ValueBinding } from '@mcpgen/config-schema';
import { authBindingsOf } from '@mcpgen/upstream-auth';

interface EnvVarEntry {
  readonly name: string;
  readonly sensitive: boolean;
}

function collectEnvBindings(bindings: Readonly<Record<string, ValueBinding>>, out: Map<string, boolean>): void {
  for (const binding of Object.values(bindings)) {
    if (binding.source === 'environment') out.set(binding.name, out.get(binding.name) ?? false);
    else if (binding.source === 'secret') out.set(binding.name, true);
  }
}

/** FR-CFG-002/FR-SEC-002: names only, no real values, no realistic-looking placeholders. */
export function buildEnvExample(config: McpProjectConfig): string {
  const vars = new Map<string, boolean>();
  collectEnvBindings({ baseUrl: config.api.baseUrl }, vars);
  if (config.upstreamAuthentication) collectEnvBindings(authBindingsOf(config.upstreamAuthentication), vars);
  for (const tool of Object.values(config.tools)) collectEnvBindings(tool.bindings, vars);

  const entries: EnvVarEntry[] = [...vars.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, sensitive]) => ({ name, sensitive }));
  const nonSensitive = entries.filter((e) => !e.sensitive);
  const sensitive = entries.filter((e) => e.sensitive);

  const lines: string[] = [];
  if (nonSensitive.length > 0) {
    lines.push('# Configuration');
    for (const e of nonSensitive) lines.push(`${e.name}=`);
    lines.push('');
  }
  if (sensitive.length > 0) {
    lines.push('# Secrets — set via your secret manager or environment. Never commit real values here.');
    for (const e of sensitive) lines.push(`${e.name}=`);
    lines.push('');
  }
  return lines.join('\n');
}
