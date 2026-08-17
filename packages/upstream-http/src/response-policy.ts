/** TIP §23. Rejecting an oversized response is the safe default; projection/pagination is OQ-09, deferred. */
export interface ResponsePolicy {
  readonly maxBytes: number;
  readonly allowedContentTypes: readonly string[];
}

export const DEFAULT_RESPONSE_POLICY: ResponsePolicy = {
  maxBytes: 5 * 1024 * 1024,
  allowedContentTypes: ['application/json', 'text/plain', 'text/html'],
};

export const DEFAULT_TIMEOUT_MS = 30_000;

export function isAllowedContentType(contentType: string | null, policy: ResponsePolicy): boolean {
  if (contentType === null) return true; // no declared type — let JSON-parse-or-fallback decide
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return policy.allowedContentTypes.some((allowed) => base === allowed.toLowerCase());
}
