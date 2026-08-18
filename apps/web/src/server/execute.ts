import { randomUUID } from 'node:crypto';
import { BlockedFetchError, createSafeFetch } from '@mcpgen/openapi-adapter';
import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import { buildToolRegistry, validateStartupRequirements } from '@mcpgen/mcp-runtime';
import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation } from '@mcpgen/domain';
import type { ExecutionTrace, RedactedHttpRequest } from '@mcpgen/control-contracts';
import { redactHeaders, redactString, redactValue } from '@mcpgen/redaction';
import { OAuthTokenProvider } from '@mcpgen/upstream-auth';

/**
 * One `OAuthTokenProvider` per server process — its token cache only helps
 * if it's long-lived (the class's own doc comment), not reconstructed per
 * playground call. Shares the same recording `fetchImpl` as the tool call
 * itself, so a token-acquisition request is subject to the identical egress
 * policy and shows up in the recorded trace like any other outbound call.
 */
let sharedOAuthTokenProvider: OAuthTokenProvider | undefined;

export type ExecuteOutcome =
  | { readonly ok: true; readonly trace: ExecutionTrace }
  | { readonly ok: false; readonly kind: 'tool-not-found' }
  | { readonly ok: false; readonly kind: 'risk-not-acknowledged' }
  | { readonly ok: false; readonly kind: 'egress-blocked'; readonly message: string }
  | { readonly ok: false; readonly kind: 'base-url-unresolved'; readonly message: string };

interface RecordedRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  status?: number;
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  if (!init?.headers) return {};
  return Object.fromEntries(new Headers(init.headers).entries());
}

/**
 * The `DESTRUCTIVE`/`PRIVILEGED` risk gate and the egress policy are the
 * only two things this function adds on top of `buildToolRegistry` — the
 * actual request/response handling is 100% the real runtime path
 * (`tool.execute()`), not a second reimplementation, so the playground can
 * never drift from what a generated server would actually do (R5).
 */
export async function performExecute(
  config: McpProjectConfig,
  operationsById: Readonly<Record<string, CanonicalOperation>>,
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  envOverrides: Readonly<Record<string, string>>,
  secretOverrides: Readonly<Record<string, string>>,
  acknowledgeRisk: boolean,
  allowPrivateEgress: boolean,
): Promise<ExecuteOutcome> {
  const toolConfig: ToolConfig | undefined = Object.values(config.tools).find((tool) => tool.enabled && tool.name === toolName);
  if (!toolConfig) return { ok: false, kind: 'tool-not-found' };

  if ((toolConfig.risk === 'DESTRUCTIVE' || toolConfig.risk === 'PRIVILEGED') && !acknowledgeRisk) {
    return { ok: false, kind: 'risk-not-acknowledged' };
  }

  const ctx: BindingResolutionContext = {
    toolInput: input,
    getEnv: (name) => envOverrides[name] ?? process.env[name],
    resolveSecret: async (name) => secretOverrides[name],
  };

  const startup = await validateStartupRequirements(config, ctx);
  if (!startup.baseUrl) {
    const message = startup.diagnostics.map((d) => d.message).join('; ') || 'Base URL did not resolve';
    return { ok: false, kind: 'base-url-unresolved', message };
  }

  const { fetch: safeFetch } = createSafeFetch({
    allowedSchemes: allowPrivateEgress ? ['https', 'http'] : ['https'],
    allowPrivateNetworks: allowPrivateEgress,
    maxRedirects: 5,
    maxDocumentBytes: 20_000_000,
    maxTotalBytes: 20_000_000,
    maxReferenceDepth: 100,
    maxReferences: 50,
    timeoutMs: 30_000,
  });

  const recorded: RecordedRequest = {};
  let blockedMessage: string | undefined;

  const recordingFetch: typeof fetch = async (fetchInput, init) => {
    recorded.method = init?.method ?? 'GET';
    recorded.url = urlOf(fetchInput as string | URL | Request);
    recorded.headers = headersOf(init);
    try {
      const response = await safeFetch(fetchInput, init);
      recorded.status = response.status;
      return response;
    } catch (error) {
      if (error instanceof BlockedFetchError) blockedMessage = error.message;
      throw error;
    }
  };

  sharedOAuthTokenProvider ??= new OAuthTokenProvider({ fetchImpl: recordingFetch });

  const { tools } = buildToolRegistry(config, operationsById, {
    baseUrl: startup.baseUrl,
    getEnv: ctx.getEnv,
    resolveSecret: ctx.resolveSecret,
    fetchImpl: recordingFetch,
    oauthTokenProvider: sharedOAuthTokenProvider,
  });

  const tool = tools.find((t) => t.name === toolName);
  if (!tool) return { ok: false, kind: 'tool-not-found' };

  const startedAtMs = Date.now();
  let result;
  try {
    result = await tool.execute(input);
  } catch (error) {
    if (blockedMessage) return { ok: false, kind: 'egress-blocked', message: blockedMessage };
    throw error;
  }
  if (blockedMessage) return { ok: false, kind: 'egress-blocked', message: blockedMessage };
  const durationMs = Date.now() - startedAtMs;

  const secretValues = Object.values(secretOverrides);
  const redactionCtx = { secretValues };

  let resolvedRequest: RedactedHttpRequest | undefined;
  if (recorded.url !== undefined && recorded.method !== undefined) {
    resolvedRequest = {
      method: recorded.method,
      url: redactString(recorded.url, redactionCtx),
      headers: redactHeaders(recorded.headers ?? {}, redactionCtx),
    };
  }

  const resultType: ExecutionTrace['resultType'] = !result.isError ? 'success' : recorded.status !== undefined ? 'upstream-error' : 'validation-error';

  const trace: ExecutionTrace = {
    traceId: randomUUID(),
    toolName,
    startedAt: new Date(startedAtMs).toISOString(),
    durationMs,
    input: redactValue(input, redactionCtx),
    ...(resolvedRequest ? { resolvedRequest } : {}),
    ...(recorded.status !== undefined ? { upstreamStatus: recorded.status } : {}),
    response: redactValue(result.structuredContent ?? result.content, redactionCtx),
    resultType,
  };

  return { ok: true, trace };
}
