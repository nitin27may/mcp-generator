import type { RetryConfig, ToolRisk } from '@mcpgen/config-schema';

/** TIP §21 backoff shape. Not per-tool configurable in this pass — see TIP §21 note. */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly totalDeadlineMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
  totalDeadlineMs: 30_000,
};

/**
 * TIP §21: GET/HEAD retry by default; everything else (including PUT) is off
 * by default. `method` is `HttpRequestParts.method` (binding-engine), which
 * is deliberately typed `string` rather than the canonical `HttpMethod` —
 * this operates at the already-resolved HTTP-request boundary, not the
 * canonical model, so it takes a plain string rather than re-narrowing it.
 */
const METHOD_RETRYABLE_BY_DEFAULT: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/** TIP §21 transient candidates, minus network resets (handled separately — no status code exists for those). */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([408, 429, 502, 503, 504]);

/**
 * Whether a tool call is allowed to retry at all. `DESTRUCTIVE`/`PRIVILEGED`
 * risk is a hard floor — BR-006's "never auto-enable a destructive action"
 * extends here: retrying after an ambiguous network failure on a destructive
 * op risks double execution, so no per-tool `retry.enabled` override can turn
 * it back on. Below that floor, an explicit `retry.enabled` wins; absent
 * that, the HTTP method's default applies.
 */
export function isRetryEligible(method: string, risk: ToolRisk, retryConfig: RetryConfig | undefined): boolean {
  if (risk === 'DESTRUCTIVE' || risk === 'PRIVILEGED') return false;
  if (retryConfig?.enabled !== undefined) return retryConfig.enabled;
  return METHOD_RETRYABLE_BY_DEFAULT.has(method);
}

export function isTransientFailure(status: number | undefined, wasNetworkError: boolean): boolean {
  if (wasNetworkError) return true;
  return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
}

/** Seconds (RFC 7231) or an HTTP-date. Returns `undefined` for anything else. */
export function parseRetryAfterMs(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : undefined;
}

/**
 * Full jitter: `[0, cappedExponentialDelay]`. Prevents synchronized retry
 * storms across concurrent tool calls hitting the same transient failure.
 * `Retry-After`, when present, takes precedence over the computed backoff
 * (still capped at `maxDelayMs` — an upstream can't force an unbounded wait).
 */
export function computeBackoffMs(attempt: number, policy: RetryPolicy, retryAfterMs: number | undefined): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, policy.maxDelayMs);
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  return Math.random() * capped;
}
