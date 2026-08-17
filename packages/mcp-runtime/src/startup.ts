import { resolveBindingValues, type BindingResolutionContext } from '@mcpgen/binding-engine';
import type { McpProjectConfig, ValueBinding } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';
import { authBindingsOf } from '@mcpgen/upstream-auth';

/**
 * TIP §33's "verify required secrets exist" step, done *before* any tool is
 * ever called. `tool-input` bindings are skipped — there is no tool call in
 * progress yet, so they have nothing to resolve against; only
 * environment/secret/static bindings are checkable at startup.
 */
function nonToolInputBindings(bindings: Readonly<Record<string, ValueBinding>>): Record<string, ValueBinding> {
  return Object.fromEntries(Object.entries(bindings).filter(([, binding]) => binding.source !== 'tool-input'));
}

export interface StartupCheckResult {
  readonly baseUrl?: string;
  readonly diagnostics: Diagnostic[];
}

export async function validateStartupRequirements(
  config: McpProjectConfig,
  ctx: BindingResolutionContext,
): Promise<StartupCheckResult> {
  const diagnostics: Diagnostic[] = [];

  const baseUrlResolution = await resolveBindingValues({ baseUrl: config.api.baseUrl }, ctx);
  diagnostics.push(...baseUrlResolution.diagnostics);
  const baseUrl = baseUrlResolution.values.baseUrl;

  if (config.upstreamAuthentication) {
    const authResolution = await resolveBindingValues(nonToolInputBindings(authBindingsOf(config.upstreamAuthentication)), ctx);
    diagnostics.push(...authResolution.diagnostics);
  }

  for (const [key, tool] of Object.entries(config.tools)) {
    if (!tool.enabled) continue;
    const resolution = await resolveBindingValues(nonToolInputBindings(tool.bindings), ctx);
    for (const diagnostic of resolution.diagnostics) {
      diagnostics.push({ ...diagnostic, message: `tool "${key}": ${diagnostic.message}` });
    }
  }

  return { ...(baseUrl !== undefined ? { baseUrl } : {}), diagnostics };
}
