import { buildHttpRequestParts, resolveBindingValues, type BindingResolutionContext } from '@mcpgen/binding-engine';
import type { DryRunRequestPreview, DryRunResult } from '@mcpgen/control-contracts';
import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation, Diagnostic } from '@mcpgen/domain';
import { validateStartupRequirements } from '@mcpgen/mcp-runtime';
import { redactHeaders } from '@mcpgen/redaction';

/**
 * Diagnostic codes `resolveBindingValues` raises for a binding that's simply
 * unresolved in this ephemeral preview context (no real secret provider, no
 * real deployed env) — dry-run substitutes a placeholder for these rather
 * than treating them as blocking errors, since the whole point is to show
 * *what the request would look like*, not to require a fully-configured
 * deployment first.
 */
const PLACEHOLDER_CODES = new Set(['AUT-001', 'BND-005']);

function placeholderFor(binding: { source: string; name: string }): string {
  return binding.source === 'secret' ? `<SECRET:${binding.name}>` : `<ENV:${binding.name}>`;
}

/**
 * `resolveBindingValues` + `buildHttpRequestParts` directly — never
 * `buildToolRegistry`, which would also attach auth and actually execute
 * (that's `performExecute`, Increment 10). `resolveSecret` always returns
 * `undefined`: a dry-run never accepts or needs a real secret value.
 */
export async function performDryRun(
  config: McpProjectConfig,
  toolConfig: ToolConfig,
  operation: CanonicalOperation,
  input: Readonly<Record<string, unknown>>,
  envOverrides: Readonly<Record<string, string>>,
): Promise<DryRunResult> {
  const ctx: BindingResolutionContext = {
    toolInput: input,
    getEnv: (name) => envOverrides[name],
    resolveSecret: async () => undefined,
  };

  const startup = await validateStartupRequirements(config, ctx);
  const { values, diagnostics: bindingDiagnostics } = await resolveBindingValues(toolConfig.bindings, ctx);

  const previewValues = { ...values };
  const unresolvedVariables: string[] = [];
  const hardDiagnostics: Diagnostic[] = [];

  for (const diagnostic of bindingDiagnostics) {
    const key = diagnostic.sourcePointer?.startsWith('#/bindings/') ? diagnostic.sourcePointer.slice('#/bindings/'.length) : undefined;
    const binding = key !== undefined ? toolConfig.bindings[key] : undefined;

    if (PLACEHOLDER_CODES.has(diagnostic.code) && key !== undefined && binding && (binding.source === 'secret' || binding.source === 'environment')) {
      previewValues[key] = placeholderFor(binding);
      unresolvedVariables.push(binding.name);
    } else {
      hardDiagnostics.push(diagnostic);
    }
  }

  const { parts, diagnostics: requestDiagnostics } = buildHttpRequestParts(operation, previewValues);

  const request: DryRunRequestPreview = {
    method: parts.method,
    path: parts.path,
    query: [...parts.query.entries()],
    headers: redactHeaders(parts.headers),
    ...(parts.body !== undefined ? { body: parts.body } : {}),
  };

  return {
    ...(startup.baseUrl !== undefined ? { baseUrl: startup.baseUrl } : {}),
    request,
    unresolvedVariables,
    diagnostics: [...hardDiagnostics, ...requestDiagnostics],
  };
}
