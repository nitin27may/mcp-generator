import { buildHttpRequestParts, resolveBindingValues, type BindingResolutionContext } from '@mcpgen/binding-engine';
import type { McpProjectConfig, ToolConfig, ValueBinding } from '@mcpgen/config-schema';
import type { CanonicalOperation, Diagnostic } from '@mcpgen/domain';
import type { ProtocolTool, ProtocolToolResult } from '@mcpgen/mcp-protocol';
import { redactValue } from '@mcpgen/redaction';
import { authBindingsOf } from '@mcpgen/upstream-auth';
import { executeUpstreamRequest } from '@mcpgen/upstream-http';

export interface RuntimeDeps {
  readonly baseUrl: string;
  readonly getEnv: (name: string) => string | undefined;
  readonly resolveSecret: (name: string) => Promise<string | undefined>;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Only `source: 'secret'` bindings are redaction targets. Naively treating
 * every resolved binding as "must not appear in output" is wrong and was
 * caught by the real integration test below: a tool-input value like a
 * customer ID can legitimately reappear in the response body (an API
 * echoing back the resource it just returned), and redacting it there would
 * corrupt real data rather than protect anything.
 */
function secretValuesOf(
  bindings: Readonly<Record<string, ValueBinding>>,
  resolved: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(bindings)
    .filter(([, binding]) => binding.source === 'secret')
    .map(([key]) => resolved[key])
    .filter((value): value is string => value !== undefined);
}

function diagnosticsToResult(diagnostics: readonly Diagnostic[]): ProtocolToolResult {
  return {
    content: [{ type: 'text', text: diagnostics.map((d) => `[${d.code}] ${d.message}`).join('\n') }],
    isError: true,
    resultType: 'complete',
  };
}

/**
 * Builds the actual `execute()` pipeline for one tool: resolve bindings ->
 * shape the HTTP request -> attach auth -> call upstream -> map the result.
 * Every failure path returns a `ProtocolToolResult` with `isError: true`
 * rather than throwing — a thrown exception from a tool handler is not
 * something the SDK is obligated to turn into a clean MCP error for the
 * agent (research notes §5 shows the SDK does this for *input* validation
 * only, not for handler-thrown exceptions).
 */
function buildExecute(
  toolConfig: ToolConfig,
  operation: CanonicalOperation,
  config: McpProjectConfig,
  deps: RuntimeDeps,
): ProtocolTool['execute'] {
  return async (args: Record<string, unknown>): Promise<ProtocolToolResult> => {
    const ctx: BindingResolutionContext = { toolInput: args, getEnv: deps.getEnv, resolveSecret: deps.resolveSecret };

    const resolvedBindings = await resolveBindingValues(toolConfig.bindings, ctx);
    if (resolvedBindings.diagnostics.length > 0) return diagnosticsToResult(resolvedBindings.diagnostics);

    const { parts, diagnostics: partsDiagnostics } = buildHttpRequestParts(operation, resolvedBindings.values);
    if (partsDiagnostics.length > 0) return diagnosticsToResult(partsDiagnostics);

    let auth: { config: NonNullable<McpProjectConfig['upstreamAuthentication']>; resolvedValues: Record<string, string> } | undefined;
    const secretValuesForRedaction = secretValuesOf(toolConfig.bindings, resolvedBindings.values);

    if (config.upstreamAuthentication) {
      const authBindings: Record<string, ValueBinding> = authBindingsOf(config.upstreamAuthentication);
      const resolvedAuth = await resolveBindingValues(authBindings, ctx);
      if (resolvedAuth.diagnostics.length > 0) return diagnosticsToResult(resolvedAuth.diagnostics);
      secretValuesForRedaction.push(...secretValuesOf(authBindings, resolvedAuth.values));
      auth = { config: config.upstreamAuthentication, resolvedValues: resolvedAuth.values };
    }

    const { result, diagnostics } = await executeUpstreamRequest(
      { baseUrl: deps.baseUrl, parts, ...(auth ? { auth } : {}) },
      { ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) },
    );
    if (!result) return diagnosticsToResult(diagnostics);

    // FR-HTTP-005: an upstream response occasionally echoes back a header or
    // token it was sent (error bodies do this more than you'd expect) — the
    // redaction pass here is a safety net, not decoration.
    const redactionContext = { secretValues: secretValuesForRedaction };
    const safeBody = redactValue(result.body, redactionContext);

    return {
      content: [{ type: 'text', text: JSON.stringify(safeBody) }],
      structuredContent: safeBody,
      isError: result.status >= 400,
      resultType: 'complete',
    };
  };
}

export function buildToolRegistry(
  config: McpProjectConfig,
  operations: Readonly<Record<string, CanonicalOperation>>,
  deps: RuntimeDeps,
): { tools: ProtocolTool[]; diagnostics: Diagnostic[] } {
  const tools: ProtocolTool[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const [key, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) continue;

    const operation = operations[toolConfig.sourceOperation.internalOperationId];
    if (!operation) {
      // BR-001: no generated tool may reference an unresolved operation.
      diagnostics.push({
        severity: 'error',
        code: 'GEN-004',
        message: `Tool "${key}" references operation "${toolConfig.sourceOperation.internalOperationId}", which was not found`,
        sourcePointer: `#/tools/${key}/sourceOperation`,
      });
      continue;
    }

    tools.push({
      name: toolConfig.name,
      description: toolConfig.description,
      inputSchema: buildInputSchema(operation),
      execute: buildExecute(toolConfig, operation, config, deps),
    });
  }

  return { tools, diagnostics };
}

/**
 * P0's schema assembly: parameters become required/optional properties by
 * location, request-body fields are flattened alongside them (matching
 * binding-engine's own key-space — see build-request.ts). The real
 * generator (P2-W15-E01) will use schema-normalizer's sanitized, budget-
 * checked schemas directly; this is the minimum needed to prove the P0 slice.
 */
function buildInputSchema(operation: CanonicalOperation): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of operation.parameters) {
    properties[param.sourceName] = param.schema.kind === 'inline' ? param.schema.schema.schema : {};
    if (param.required) required.push(param.sourceName);
  }

  if (operation.requestBody) {
    const bodySchema = operation.requestBody.schema;
    if (bodySchema.kind === 'inline' && bodySchema.schema.schema.properties) {
      const bodyProps = bodySchema.schema.schema.properties as Record<string, unknown>;
      for (const [key, schema] of Object.entries(bodyProps)) properties[key] = schema;
      const bodyRequired = bodySchema.schema.schema.required;
      if (Array.isArray(bodyRequired)) required.push(...bodyRequired.map(String));
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
