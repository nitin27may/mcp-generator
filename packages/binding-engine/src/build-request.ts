import type { CanonicalOperation, Diagnostic } from '@mcpgen/domain';

/**
 * TIP §17.2 — the parts an operation contributes to an HTTP request.
 * Deliberately *not* the full `ResolvedHttpRequest` from TIP §17.2 (method +
 * full `URL` + headers + body): base-URL resolution and auth attachment
 * happen in `upstream-http` (P0-W09-T01), which combines this with the
 * server's base URL and the upstream auth binding. This package has no
 * network concern and doesn't need to know the base URL exists.
 */
export interface HttpRequestParts {
  readonly method: string;
  /** The operation's path template with `{param}` placeholders substituted and percent-encoded. */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Record<string, string>;
  readonly body?: Record<string, unknown>;
}

/** RFC 9110 header-injection guard: a header value must not carry CR or LF. */
const HAS_CR_OR_LF = /[\r\n]/;

function pointerFor(sourceName: string): string {
  return `#/bindings/${sourceName}`;
}

export function buildHttpRequestParts(
  operation: CanonicalOperation,
  resolvedValues: Readonly<Record<string, string>>,
): { parts: HttpRequestParts; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let path = operation.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  const claimedKeys = new Set<string>();

  for (const param of operation.parameters) {
    claimedKeys.add(param.sourceName);
    const value = resolvedValues[param.sourceName];

    if (value === undefined) {
      if (param.required) {
        diagnostics.push({
          severity: 'error',
          code: 'BND-001',
          message: `Required upstream value "${param.sourceName}" has no binding`,
          sourcePointer: pointerFor(param.sourceName),
        });
      }
      continue;
    }

    switch (param.location) {
      case 'path': {
        const placeholder = `{${param.sourceName}}`;
        if (!path.includes(placeholder)) {
          diagnostics.push({
            severity: 'error',
            code: 'BND-001',
            message: `Path parameter "${param.sourceName}" has no matching {${param.sourceName}} placeholder in "${operation.path}"`,
            sourcePointer: pointerFor(param.sourceName),
          });
          break;
        }
        path = path.replaceAll(placeholder, encodeURIComponent(value));
        break;
      }
      case 'query':
        query.append(param.sourceName, value);
        break;
      case 'header':
        if (HAS_CR_OR_LF.test(value)) {
          diagnostics.push({
            severity: 'error',
            code: 'SEC-005',
            message: `Header "${param.sourceName}" value contains a carriage return or line feed — refusing to construct the request`,
            sourcePointer: pointerFor(param.sourceName),
          });
          break;
        }
        headers[param.sourceName] = value;
        break;
      case 'cookie':
        cookies.push(`${param.sourceName}=${value}`);
        break;
    }
  }

  if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');

  let body: Record<string, unknown> | undefined;
  if (operation.requestBody) {
    body = {};
    for (const [key, value] of Object.entries(resolvedValues)) {
      if (claimedKeys.has(key)) continue; // already placed as a path/query/header/cookie parameter
      body[key] = value;
    }
    if (operation.requestBody.required && Object.keys(body).length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'BND-001',
        message: `Operation requires a request body but no bindings target it`,
        sourcePointer: '#/bindings',
      });
    }
  } else {
    // No request body to receive them, and no parameter claimed them —
    // the config references a binding key that doesn't correspond to
    // anything on this operation, which usually means a typo.
    for (const key of Object.keys(resolvedValues)) {
      if (claimedKeys.has(key)) continue;
      diagnostics.push({
        severity: 'warning',
        code: 'BND-002',
        message: `Binding "${key}" does not correspond to any parameter on this operation, and the operation has no request body`,
        sourcePointer: pointerFor(key),
      });
    }
  }

  return {
    parts: { method: operation.method, path, query, headers, ...(body !== undefined ? { body } : {}) },
    diagnostics,
  };
}
