import type { HttpRequestParts } from '@mcpgen/binding-engine';
import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';
import { attachUpstreamAuth, type AuthTarget } from '@mcpgen/upstream-auth';
import { DEFAULT_RESPONSE_POLICY, DEFAULT_TIMEOUT_MS, isAllowedContentType, type ResponsePolicy } from './response-policy.js';

export interface ExecutionResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly durationMs: number;
}

export interface ExecuteUpstreamRequestInput {
  readonly baseUrl: string;
  readonly parts: HttpRequestParts;
  readonly auth?: {
    readonly config: UpstreamAuthentication;
    readonly resolvedValues: Readonly<Record<string, string>>;
  };
  readonly timeoutMs?: number;
  /** Not yet wired to MCP-level cancellation (that lands in P1-W13-T01) — accepted for forward compatibility. */
  readonly signal?: AbortSignal;
  readonly responsePolicy?: ResponsePolicy;
}

export interface ExecuteUpstreamRequestDeps {
  readonly fetchImpl?: typeof fetch;
}

function networkFailureDiagnostic(reason: string): Diagnostic {
  return { severity: 'error', code: 'UPS-000', message: `Upstream request failed: ${reason}` };
}

function timeoutDiagnostic(timeoutMs: number): Diagnostic {
  return { severity: 'error', code: 'UPS-001', message: `Upstream request timed out after ${timeoutMs}ms` };
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Reads a response body up to `maxBytes`. On overflow, the stream is
 * cancelled and no partial body is returned — TIP §23 forbids unsafe byte
 * truncation of JSON, so "some of the bytes" is not a usable result.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text?: string; oversized: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: await response.text(), oversized: false };

  const decoder = new TextDecoder();
  let text = '';
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { oversized: true };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { text, oversized: false };
}

function parseBody(text: string, contentType: string | null): unknown {
  const base = contentType?.split(';')[0]?.trim().toLowerCase();
  if (base === 'application/json') {
    try {
      return JSON.parse(text);
    } catch {
      return text; // malformed JSON from upstream — return raw text rather than throwing
    }
  }
  return text;
}

/**
 * TIP §20 UpstreamExecutor. Never retries (P0 scope — TIP §21 retry policy is
 * P1-W09-T01) and never logs the request URL with its query string, since an
 * apiKey-in-query auth binding would put the credential there — diagnostics
 * report method + path only.
 */
export async function executeUpstreamRequest(
  input: ExecuteUpstreamRequestInput,
  deps: ExecuteUpstreamRequestDeps = {},
): Promise<{ result?: ExecutionResult; diagnostics: Diagnostic[] }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const responsePolicy = input.responsePolicy ?? DEFAULT_RESPONSE_POLICY;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let target: AuthTarget = { headers: input.parts.headers, query: input.parts.query };
  if (input.auth) {
    const attached = attachUpstreamAuth(target, input.auth.config, input.auth.resolvedValues);
    if (attached.diagnostics.length > 0) return { diagnostics: attached.diagnostics };
    target = attached.target;
  }

  const url = new URL(input.parts.path, input.baseUrl);
  url.search = target.query.toString();

  const headers = { ...target.headers };
  let body: string | undefined;
  if (input.parts.body !== undefined) {
    body = JSON.stringify(input.parts.body);
    headers['Content-Type'] ??= 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener('abort', externalAbort, { once: true });
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: input.parts.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    const wasAborted = controller.signal.aborted;
    return { diagnostics: [wasAborted ? timeoutDiagnostic(timeoutMs) : networkFailureDiagnostic(String((error as Error).message ?? error))] };
  } finally {
    clearTimeout(timer);
    if (input.signal) input.signal.removeEventListener('abort', externalAbort);
  }

  const durationMs = Date.now() - startedAt;
  const contentType = response.headers.get('content-type');

  if (!isAllowedContentType(contentType, responsePolicy)) {
    return {
      diagnostics: [
        { severity: 'error', code: 'UPS-004', message: `Unexpected content type "${contentType ?? ''}"` },
      ],
    };
  }

  const { text, oversized } = await readBodyWithLimit(response, responsePolicy.maxBytes);
  if (oversized) {
    return {
      diagnostics: [
        { severity: 'error', code: 'UPS-003', message: `Response exceeded ${responsePolicy.maxBytes} bytes` },
      ],
    };
  }

  return {
    result: {
      status: response.status,
      headers: headersToObject(response.headers),
      body: parseBody(text ?? '', contentType),
      durationMs,
    },
    diagnostics: [],
  };
}
