import type { McpProjectConfig } from '@mcpgen/config-schema';
import { collectConfigEnvBindings, type ConfigEnvBinding } from '@mcpgen/upstream-auth';

/** BRD §16's "configuration preview" — aggregated across `api.baseUrl`, `upstreamAuthentication`, and every *enabled* tool's bindings. Not a literal implementation of the BRD mockup's `type`/`default` columns — this build can't honestly infer a semantic type for every binding, so it sticks to what's structurally knowable: name, required, sensitive, and where it's used. */
export type EnvVarSummaryEntry = ConfigEnvBinding;

/** Every `environment`/`secret` binding this project actually depends on. Deterministic order: sorted by name. Thin re-export of `@mcpgen/upstream-auth`'s `collectConfigEnvBindings` — the one implementation of this walk, also used by the generated `.env.example` and generated `README.md`. */
export function buildEnvVarSummary(config: McpProjectConfig): readonly EnvVarSummaryEntry[] {
  return collectConfigEnvBindings(config);
}
