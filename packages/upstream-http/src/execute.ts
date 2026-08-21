import type { HttpRequestParts } from '@mcpgen/binding-engine';
import type { RetryConfig, ToolRisk, UpstreamAuthentication } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';
import { attachUpstreamAuth, type AuthTarget, type OAuthTokenProvider, type TokenExchangeProvider } from '@mcpgen/upstream-auth';
import { DEFAULT_RESPONSE_POLICY, DEFAULT_TIMEOUT_MS, isAllowedContentType, type ResponsePolicy } from './response-policy.js';
import {
  computeBackoffMs,
  DEFAULT_RETRY_POLICY,
  isRetryEligible,
  isTransientFailure,
  parseRetryAfterMs,
  type RetryPolicy,
} from './retry-policy.js';

export interface ExecutionResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly durationMs: number;
  /** How many HTTP attempts were made (1 = no retry occurred). */
  readonly attempts: number;
}

export interface ExecuteUpstreamRequestInput {
  readonly baseUrl: string;
  readonly parts: HttpRequestParts;
  readonly auth?: {
    readonly config: UpstreamAuthentication;
    readonly resolvedValues: Readonly<Record<string, string>>;
  };
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly responsePolicy?: ResponsePolicy;
  /** TIP §21 retry eligibility inputs. Omitted entirely == retry disabled (safest default). */
  readonly retry?: { readonly risk: ToolRisk; readonly config?: RetryConfig };
  readonly retryPolicy?: RetryPolicy;
}

export interface ExecuteUpstreamRequestDeps {
  readonly fetchImpl?: typeof fetch;
  readonly oauthTokenProvider?: OAuthTokenProvider;
  /** Long-lived, same reasoning as `oauthTokenProvider`. Required for `oauth2TokenExchange`. */
  readonly tokenExchangeProvider?: TokenExchangeProvider;
  /**
   * The verified Plane A access token (ADR-0010). Reaches `attachUpstreamAuth` for one
   * purpose — to be exchanged at the authorization server — and is never attached to the
   * request built below.
   */
  readonly callerToken?: string;
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

interface AttemptOutcome {
  /** Present only for outcomes eligible to be returned as final (2xx..5xx included — status is the caller's judgment call, not this layer's). */
  readonly result?: Omit<ExecutionResult, 'attempts'>;
  readonly diagnostics: Diagnostic[];
  readonly transient: boolean;
  readonly retryAfterMs?: number;
}

async function performAttempt(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  responsePolicy: ResponsePolicy,
  fetchImpl: typeof fetch,
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(url, { method, headers, ...(body !== undefined ? { body } : {}), signal: controller.signal });
  } catch (error) {
    const wasAborted = controller.signal.aborted;
    const wasExternallyAborted = externalSignal?.aborted === true;
    return {
      diagnostics: [wasAborted ? timeoutDiagnostic(timeoutMs) : networkFailureDiagnostic(String((error as Error).message ?? error))],
      // An external cancellation (MCP-level) is not a transient upstream condition — retrying would ignore the cancel.
      transient: !wasExternallyAborted,
    };
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }

  const durationMs = Date.now() - startedAt;
  const contentType = response.headers.get('content-type');

  if (!isAllowedContentType(contentType, responsePolicy)) {
    return {
      diagnostics: [{ severity: 'error', code: 'UPS-004', message: `Unexpected content type "${contentType ?? ''}"` }],
      transient: false,
    };
  }

  const { text, oversized } = await readBodyWithLimit(response, responsePolicy.maxBytes);
  if (oversized) {
    return {
      diagnostics: [{ severity: 'error', code: 'UPS-003', message: `Response exceeded ${responsePolicy.maxBytes} bytes` }],
      transient: false,
    };
  }

  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), Date.now());
  return {
    result: { status: response.status, headers: headersToObject(response.headers), body: parseBody(text ?? '', contentType), durationMs },
    diagnostics: [],
    transient: isTransientFailure(response.status, false),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * TIP §20 UpstreamExecutor + TIP §21 retry policy. Auth is attached once
 * (headers/query are stable across attempts); the HTTP attempt itself is
 * retried with backoff+jitter when `input.retry` says the tool is eligible
 * (TIP §21: DESTRUCTIVE/PRIVILEGED risk is a hard floor, method defaults
 * otherwise) and the failure is transient (network error, 408/429/502/503/
 * 504). Retries never exceed `retryPolicy.totalDeadlineMs` or the caller's
 * `signal` (TIP §22: retries must not exceed the overall tool deadline).
 * Never logs the request URL with its query string, since an apiKey-in-query
 * auth binding would put the credential there — diagnostics report method +
 * path only.
 */
export async function executeUpstreamRequest(
  input: ExecuteUpstreamRequestInput,
  deps: ExecuteUpstreamRequestDeps = {},
): Promise<{ result?: ExecutionResult; diagnostics: Diagnostic[]; acquiredSecrets?: readonly string[] }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const responsePolicy = input.responsePolicy ?? DEFAULT_RESPONSE_POLICY;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryPolicy = input.retryPolicy ?? DEFAULT_RETRY_POLICY;

  let target: AuthTarget = { headers: input.parts.headers, query: input.parts.query };
  let acquiredSecrets: readonly string[] = [];
  if (input.auth) {
    const attached = await attachUpstreamAuth(target, input.auth.config, input.auth.resolvedValues, {
      ...(deps.oauthTokenProvider ? { tokenProvider: deps.oauthTokenProvider } : {}),
      ...(deps.tokenExchangeProvider ? { tokenExchangeProvider: deps.tokenExchangeProvider } : {}),
      ...(deps.callerToken ? { callerToken: deps.callerToken } : {}),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
    if (attached.diagnostics.length > 0) return { diagnostics: attached.diagnostics };
    target = attached.target;
    acquiredSecrets = attached.acquiredSecrets ?? [];
  }

  const url = new URL(input.parts.path, input.baseUrl);
  url.search = target.query.toString();

  const headers = { ...target.headers };
  let body: string | undefined;
  if (input.parts.body !== undefined) {
    body = JSON.stringify(input.parts.body);
    headers['Content-Type'] ??= 'application/json';
  }

  const retryEligible = input.retry ? isRetryEligible(input.parts.method, input.retry.risk, input.retry.config) : false;
  const overallStartedAt = Date.now();

  for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
    const outcome = await performAttempt(url, input.parts.method, headers, body, timeoutMs, input.signal, responsePolicy, fetchImpl);

    const isLastAttempt = attempt === retryPolicy.maxAttempts;
    const backoffMs = computeBackoffMs(attempt, retryPolicy, outcome.retryAfterMs);
    const wouldExceedDeadline = Date.now() - overallStartedAt + backoffMs > retryPolicy.totalDeadlineMs;
    const shouldRetry = retryEligible && outcome.transient && !isLastAttempt && !wouldExceedDeadline && input.signal?.aborted !== true;

    if (!shouldRetry) {
      // acquiredSecrets rides along on every terminal outcome, success or failure: a
      // failure body is exactly where an echoed credential would show up.
      if (outcome.result) return { result: { ...outcome.result, attempts: attempt }, diagnostics: [], acquiredSecrets };
      return { diagnostics: outcome.diagnostics, acquiredSecrets };
    }

    await sleep(backoffMs, input.signal);
  }

  // Unreachable when maxAttempts >= 1 (the loop always returns on its last iteration), kept for type-narrowing.
  return { diagnostics: [networkFailureDiagnostic('retry loop exhausted without a final outcome')] };
}
