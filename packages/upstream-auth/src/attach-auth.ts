import { Buffer } from 'node:buffer';
import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';

export interface AuthTarget {
  readonly headers: Record<string, string>;
  readonly query: URLSearchParams;
}

function missingValueDiagnostic(key: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AUT-001',
    message: `Upstream auth value "${key}" was not resolved`,
    sourcePointer: `#/upstreamAuthentication/${key}`,
  };
}

/**
 * Attaches an already-resolved upstream credential to a request. Takes
 * *resolved* string values (keyed per `authBindingsOf`), not `ValueBinding`s —
 * resolving them is `binding-engine`'s job, wired together by the caller.
 * Never mutates `target`.
 */
export function attachUpstreamAuth(
  target: AuthTarget,
  auth: UpstreamAuthentication,
  resolvedAuthValues: Readonly<Record<string, string>>,
): { target: AuthTarget; diagnostics: Diagnostic[] } {
  switch (auth.type) {
    case 'apiKey': {
      const value = resolvedAuthValues.value;
      if (value === undefined) return { target, diagnostics: [missingValueDiagnostic('value')] };

      if (auth.in === 'header') {
        return { target: { headers: { ...target.headers, [auth.name]: value }, query: target.query }, diagnostics: [] };
      }
      const query = new URLSearchParams(target.query);
      query.set(auth.name, value);
      return { target: { headers: target.headers, query }, diagnostics: [] };
    }

    case 'bearer': {
      const token = resolvedAuthValues.token;
      if (token === undefined) return { target, diagnostics: [missingValueDiagnostic('token')] };
      return {
        target: { headers: { ...target.headers, Authorization: `Bearer ${token}` }, query: target.query },
        diagnostics: [],
      };
    }

    case 'basic': {
      const username = resolvedAuthValues.username;
      const password = resolvedAuthValues.password;
      const diagnostics: Diagnostic[] = [];
      if (username === undefined) diagnostics.push(missingValueDiagnostic('username'));
      if (password === undefined) diagnostics.push(missingValueDiagnostic('password'));
      if (diagnostics.length > 0) return { target, diagnostics };

      const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
      return {
        target: { headers: { ...target.headers, Authorization: `Basic ${encoded}` }, query: target.query },
        diagnostics: [],
      };
    }
  }
}
