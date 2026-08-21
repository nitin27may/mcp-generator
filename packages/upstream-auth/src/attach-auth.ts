import { Buffer } from 'node:buffer';
import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';
import { OAuthTokenProvider } from './oauth-token-provider.js';
import { TokenExchangeProvider } from './token-exchange-provider.js';

export interface AuthTarget {
  readonly headers: Record<string, string>;
  readonly query: URLSearchParams;
}

export interface AttachUpstreamAuthDeps {
  /** Required for `oauth2ClientCredentials` — see `OAuthTokenProvider`'s class doc for why it must be long-lived, not constructed per call. */
  readonly tokenProvider?: OAuthTokenProvider;
  /** Required for `oauth2TokenExchange`. Same lifetime argument as `tokenProvider`. */
  readonly tokenExchangeProvider?: TokenExchangeProvider;
  /**
   * The verified inbound MCP access token (ADR-0010), supplied by the runtime as a plain
   * string. It exists here ONLY to be sent to the authorization server as an RFC 8693
   * `subject_token`; no code path attaches it to an upstream request. Passing it as a
   * string rather than a caller object is deliberate — it keeps `upstream-auth` free of
   * any `mcp-protocol` type, which ADR-0005's boundary rule requires.
   */
  readonly callerToken?: string;
  readonly fetchImpl?: typeof fetch;
}

function missingValueDiagnostic(key: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AUT-001',
    message: `Upstream auth value "${key}" was not resolved`,
    sourcePointer: `#/upstreamAuthentication/${key}`,
  };
}

function bearerTarget(target: AuthTarget, token: string): AuthTarget {
  return { headers: { ...target.headers, Authorization: `Bearer ${token}` }, query: target.query };
}

/**
 * Attaches an already-resolved upstream credential to a request. Takes
 * *resolved* string values (keyed per `authBindingsOf`), not `ValueBinding`s —
 * resolving them is `binding-engine`'s job, wired together by the caller.
 * Never mutates `target`. Async because `oauth2ClientCredentials` may need to
 * make its own request to the token endpoint (via `deps.tokenProvider`) —
 * every other auth type resolves synchronously and just awaits nothing.
 */
export interface AttachUpstreamAuthResult {
  readonly target: AuthTarget;
  readonly diagnostics: Diagnostic[];
  /**
   * Credentials minted during this call rather than read from configuration — an OAuth
   * access token, an exchanged token. They are secrets exactly like a statically-bound
   * one, but nothing else knows they exist: they never appear in the binding graph, which
   * is what `redaction` derives its secret set from. Reporting them here is what lets the
   * caller add them to that set, so an upstream error body echoing one back is scrubbed.
   */
  readonly acquiredSecrets?: readonly string[];
}

export async function attachUpstreamAuth(
  target: AuthTarget,
  auth: UpstreamAuthentication,
  resolvedAuthValues: Readonly<Record<string, string>>,
  deps: AttachUpstreamAuthDeps = {},
): Promise<AttachUpstreamAuthResult> {
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
      return { target: bearerTarget(target, token), diagnostics: [] };
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

    case 'oauth2ClientCredentials': {
      const { clientId, clientSecret } = resolvedAuthValues;
      if (clientId === undefined || clientSecret === undefined) {
        const diagnostics: Diagnostic[] = [];
        if (clientId === undefined) diagnostics.push(missingValueDiagnostic('clientId'));
        if (clientSecret === undefined) diagnostics.push(missingValueDiagnostic('clientSecret'));
        return { target, diagnostics };
      }

      // A fresh provider per call has no cache to hit, but still functions correctly (RFC
      // 6749 client_credentials is safe to re-acquire) — degraded performance, not a bug.
      const tokenProvider = deps.tokenProvider ?? new OAuthTokenProvider({ ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
      const acquired = await tokenProvider.getAccessToken(auth, clientId, clientSecret);
      if (acquired.token === undefined) return { target, diagnostics: acquired.diagnostics };
      return { target: bearerTarget(target, acquired.token), diagnostics: [], acquiredSecrets: [acquired.token] };
    }

    case 'oauth2TokenExchange': {
      const { clientId, clientSecret } = resolvedAuthValues;
      if (clientId === undefined || clientSecret === undefined) {
        const diagnostics: Diagnostic[] = [];
        if (clientId === undefined) diagnostics.push(missingValueDiagnostic('clientId'));
        if (clientSecret === undefined) diagnostics.push(missingValueDiagnostic('clientSecret'));
        return { target, diagnostics };
      }

      const exchangeProvider =
        deps.tokenExchangeProvider ?? new TokenExchangeProvider({ ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
      const exchanged = await exchangeProvider.exchange(auth, clientId, clientSecret, deps.callerToken ?? '');
      if (exchanged.token === undefined) return { target, diagnostics: exchanged.diagnostics };
      // Both tokens are secrets: the exchanged one because it is a live upstream credential,
      // the caller's because an upstream that echoes it back would be leaking Plane A.
      // The EXCHANGED token goes upstream. `deps.callerToken` does not, and this is the
      // only place both are in scope at once — ADR-0005 BR-008, covered by
      // packages/test-fixtures/test/security/token-passthrough.test.ts.
      return {
        target: bearerTarget(target, exchanged.token),
        diagnostics: [],
        acquiredSecrets: [exchanged.token, deps.callerToken ?? ''].filter((s) => s.length > 0),
      };
    }
  }
}
