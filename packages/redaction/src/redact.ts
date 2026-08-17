/**
 * TIP §37 / ADR-0006: redaction runs before persistence or logging, never after,
 * and never relies on field-name heuristics alone for a *known* secret — the
 * binding graph is the authoritative source of what is secret, so callers pass
 * the resolved secret values in explicitly via `secretValues`.
 *
 * Field-name heuristics (`sensitiveHeaderNames`, the default header set, and
 * `sensitivePointers`) are the backstop for values whose sensitivity the caller
 * didn't know to declare — e.g. a field named `password` that happens not to be
 * a configured secret binding.
 */
export const REDACTED = '[REDACTED]';

const DEFAULT_SENSITIVE_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie'];

/** Catches X-API-Key, Api-Key, x_api_key, and similar variants (TIP §37). */
const API_KEY_HEADER_PATTERN = /api[-_]?key/i;

export interface RedactionContext {
  /** Resolved secret values (not names) that must never appear verbatim in output. */
  readonly secretValues?: readonly string[];
  /** Extra sensitive header names, merged with the built-in set. Case-insensitive. */
  readonly sensitiveHeaderNames?: readonly string[];
  /** RFC 6901 JSON pointers (e.g. "/password", "/auth/clientSecret") redacted unconditionally. */
  readonly sensitivePointers?: readonly string[];
}

function sensitiveHeaderSet(ctx: RedactionContext): Set<string> {
  return new Set(
    [...DEFAULT_SENSITIVE_HEADERS, ...(ctx.sensitiveHeaderNames ?? [])].map((h) => h.toLowerCase()),
  );
}

function isSensitiveHeaderName(name: string, set: ReadonlySet<string>): boolean {
  const lower = name.toLowerCase();
  return set.has(lower) || API_KEY_HEADER_PATTERN.test(lower);
}

/** Replaces every occurrence of every known secret value, even mid-string (e.g. "Bearer sk-..."). */
export function redactString(value: string, ctx: RedactionContext): string {
  let out = value;
  for (const secret of ctx.secretValues ?? []) {
    if (secret.length === 0) continue;
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

export function redactHeaders(
  headers: Readonly<Record<string, string>>,
  ctx: RedactionContext = {},
): Record<string, string> {
  const sensitive = sensitiveHeaderSet(ctx);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveHeaderName(key, sensitive) ? REDACTED : redactString(value, ctx);
  }
  return out;
}

/**
 * Deep-walks an arbitrary JSON-like value. A key matching a sensitive header
 * name, or a pointer matching `sensitivePointers`, is masked outright; every
 * other string has known secret values scrubbed as substrings.
 */
export function redactValue(value: unknown, ctx: RedactionContext = {}, pointer = ''): unknown {
  if (ctx.sensitivePointers?.includes(pointer)) return REDACTED;

  if (typeof value === 'string') return redactString(value, ctx);

  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, ctx, `${pointer}/${index}`));
  }

  if (value !== null && typeof value === 'object') {
    const sensitive = sensitiveHeaderSet(ctx);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const childPointer = `${pointer}/${key}`;
      out[key] =
        isSensitiveHeaderName(key, sensitive) || ctx.sensitivePointers?.includes(childPointer)
          ? REDACTED
          : redactValue(val, ctx, childPointer);
    }
    return out;
  }

  return value;
}
