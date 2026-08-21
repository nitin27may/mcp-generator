import { createHash } from 'node:crypto';
import type { OAuth2TokenExchangeAuth } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';

/** Matches OAuthTokenProvider: conservative when the AS omits `expires_in`. */
const DEFAULT_TTL_MS = 60_000;
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

export interface TokenExchangeResult {
  readonly token?: string;
  readonly diagnostics: Diagnostic[];
}

function exchangeFailureDiagnostic(reason: string): Diagnostic {
  return { severity: 'error', code: 'AUT-003', message: `OAuth token exchange failed: ${reason}` };
}

/**
 * The subject token is hashed, never stored. A cache key ends up in heap dumps, in
 * debugger views and occasionally in a log line someone adds while chasing a bug; a raw
 * bearer token in any of those is a live credential (ADR-0006, ADR-0010).
 */
function subjectFingerprint(subjectToken: string): string {
  return createHash('sha256').update(subjectToken).digest('base64url').slice(0, 32);
}

function cacheKey(auth: OAuth2TokenExchangeAuth, clientId: string, subjectToken: string): string {
  return [auth.tokenUrl, clientId, auth.audience ?? '', (auth.scopes ?? []).join(' '), subjectFingerprint(subjectToken)].join('::');
}

/**
 * RFC 8693 token exchange — ADR-0010, `FR-AUTH-UP-003`.
 *
 * Trades the verified inbound MCP access token for one the upstream API will accept,
 * carrying the caller's identity instead of the server's. The exchange is with the
 * AUTHORIZATION SERVER, which issued the subject token and can already validate it;
 * the subject token is never sent to the upstream API. That distinction is the entire
 * content of ADR-0010 and is what keeps ADR-0005's invariant intact.
 *
 * Cache shape mirrors `OAuthTokenProvider` — same TTL handling, same acquire lock so N
 * concurrent tool calls for one user make one exchange rather than N. It differs in one
 * respect that matters operationally: the key includes the caller, so the cache scales
 * with active users rather than staying constant.
 */
export class TokenExchangeProvider {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<TokenExchangeResult>>();
  private readonly fetchImpl: typeof fetch;

  constructor(deps: { fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async exchange(
    auth: OAuth2TokenExchangeAuth,
    clientId: string,
    clientSecret: string,
    subjectToken: string,
  ): Promise<TokenExchangeResult> {
    if (!subjectToken) {
      // No verified caller — happens when mcpAccess is absent or the transport is stdio.
      // Falling back to the server's own identity here would silently turn a delegated
      // configuration into an impersonating one, so it is an error instead.
      return {
        diagnostics: [
          exchangeFailureDiagnostic(
            'no verified caller token to exchange — oauth2TokenExchange requires mcpAccess.mode "oauth2" on an HTTP transport',
          ),
        ],
      };
    }

    const key = cacheKey(auth, clientId, subjectToken);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
      return { token: cached.accessToken, diagnostics: [] };
    }

    const inflightRequest = this.inflight.get(key);
    if (inflightRequest) return inflightRequest;

    const request = this.fetchExchange(auth, clientId, clientSecret, subjectToken, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  private async fetchExchange(
    auth: OAuth2TokenExchangeAuth,
    clientId: string,
    clientSecret: string,
    subjectToken: string,
    key: string,
  ): Promise<TokenExchangeResult> {
    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      client_id: clientId,
      client_secret: clientSecret,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_token_type: ACCESS_TOKEN_TYPE,
    });
    if (auth.audience) body.set('audience', auth.audience);
    if (auth.scopes && auth.scopes.length > 0) body.set('scope', auth.scopes.join(' '));

    let response: Response;
    try {
      response = await this.fetchImpl(auth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      });
    } catch (error) {
      return { diagnostics: [exchangeFailureDiagnostic(String((error as Error).message ?? error))] };
    }

    if (!response.ok) {
      // Deliberately reports the status only. An RFC 6749 error body can echo the request
      // back, and the request contains the subject token.
      return { diagnostics: [exchangeFailureDiagnostic(`token endpoint returned ${response.status}`)] };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { diagnostics: [exchangeFailureDiagnostic('response was not valid JSON')] };
    }

    const record = payload as Record<string, unknown>;
    const accessToken = record['access_token'];
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return { diagnostics: [exchangeFailureDiagnostic('response missing "access_token"')] };
    }

    const expiresIn = record['expires_in'];
    const ttlMs = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn * 1000 : DEFAULT_TTL_MS;
    this.cache.set(key, { accessToken, expiresAt: Date.now() + ttlMs });
    return { token: accessToken, diagnostics: [] };
  }
}
