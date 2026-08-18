import type { McpProjectConfig } from '@mcpgen/config-schema';
import { collectConfigEnvBindings } from '@mcpgen/upstream-auth';

/** FR-CFG-002/FR-SEC-002: names only, no real values, no realistic-looking placeholders. */
export function buildEnvExample(config: McpProjectConfig): string {
  const entries = collectConfigEnvBindings(config);
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
