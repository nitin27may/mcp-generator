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
      inputSchema: buildInputSchema(operation, toolConfig),
      execute: buildExecute(toolConfig, operation, config, deps),
    });
  }

  return { tools, diagnostics };
}

/**
 * The agent-facing input schema is driven by `toolConfig.bindings`, not
 * directly by `operation.parameters` — the two live in different
 * namespaces. A binding's *key* is the operation-side name (how
 * binding-engine routes a resolved value into a path/query/header/body
 * field, matching `param.sourceName`); a `tool-input` binding's `inputName`
 * is the agent-facing name (BRD FR-BIND-004: "MCP input `customer_id` ← API
 * path parameter `customerIdentifier`" — the whole point is these can
 * differ). Building the schema from `operation.parameters` directly — using
 * `param.sourceName` as the property name — publishes the *upstream* name
 * and asks the agent to supply arguments the SDK's own input validation
 * then rejects, because the tool's `execute()` reads `ctx.toolInput[inputName]`.
 * Caught by the E2E suite: the SDK returned "must have required property
 * 'customerId'" while the config's binding named the input `customer_id`.
 *
 * P0's schema assembly: only `source: 'tool-input'` bindings become input
 * properties (environment/secret/static bindings are resolved without agent
 * involvement, by construction). The real generator (P2-W15-E01) will use
 * schema-normalizer's sanitized, budget-checked schemas directly; this is
 * the minimum needed to prove the P0 slice.
 */
function buildInputSchema(operation: CanonicalOperation, toolConfig: ToolConfig): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  const parameterBySourceName = new Map(operation.parameters.map((param) => [param.sourceName, param]));

  let bodyProperties: Record<string, unknown> = {};
  let bodyRequired: ReadonlySet<string> = new Set();
  if (operation.requestBody?.schema.kind === 'inline') {
    const bodySchema = operation.requestBody.schema.schema.schema;
    bodyProperties = (bodySchema.properties as Record<string, unknown>) ?? {};
    bodyRequired = new Set(Array.isArray(bodySchema.required) ? bodySchema.required.map(String) : []);
  }

  for (const [bindingKey, binding] of Object.entries(toolConfig.bindings)) {
    if (binding.source !== 'tool-input') continue;
    const { inputName } = binding;

    const param = parameterBySourceName.get(bindingKey);
    if (param) {
      properties[inputName] = param.schema.kind === 'inline' ? param.schema.schema.schema : {};
      if (param.required) required.push(inputName);
      continue;
    }

    if (bindingKey in bodyProperties) {
      properties[inputName] = bodyProperties[bindingKey];
      if (bodyRequired.has(bindingKey)) required.push(inputName);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
