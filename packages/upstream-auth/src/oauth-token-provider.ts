import type { OAuth2ClientCredentialsAuth } from '@mcpgen/config-schema';
import type { Diagnostic } from '@mcpgen/domain';

/** Fallback when the token endpoint doesn't return `expires_in` — conservative, re-fetches often rather than risking a stale token. */
const DEFAULT_TTL_MS = 60_000;
/** Re-fetch this long before actual expiry, so an in-flight request never gets a token that expires mid-call. */
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

export interface OAuthTokenResult {
  readonly token?: string;
  readonly diagnostics: Diagnostic[];
}

function tokenFailureDiagnostic(reason: string): Diagnostic {
  return { severity: 'error', code: 'AUT-003', message: `OAuth token acquisition failed: ${reason}` };
}

function cacheKey(auth: OAuth2ClientCredentialsAuth, clientId: string): string {
  return `${auth.tokenUrl}::${clientId}::${(auth.scopes ?? []).join(' ')}`;
}

/**
 * TIP §19 V1.5 / FR-AUTH-UP-003 (originally P5-W10-E01): RFC 6749 §4.4
 * client_credentials, with a token cache and an acquire lock so N concurrent
 * tool calls sharing one auth config make at most one token-endpoint request,
 * not N. Instantiated once per server process (same lifetime pattern as
 * `EnvironmentSecretProvider`) — a fresh instance per call would defeat the
 * cache entirely, since nothing would ever survive between calls.
 */
export class OAuthTokenProvider {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<OAuthTokenResult>>();
  private readonly fetchImpl: typeof fetch;

  constructor(deps: { fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async getAccessToken(auth: OAuth2ClientCredentialsAuth, clientId: string, clientSecret: string): Promise<OAuthTokenResult> {
    const key = cacheKey(auth, clientId);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
      return { token: cached.accessToken, diagnostics: [] };
    }

    const inflightRequest = this.inflight.get(key);
    if (inflightRequest) return inflightRequest;

    const request = this.fetchToken(auth, clientId, clientSecret, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  private async fetchToken(
    auth: OAuth2ClientCredentialsAuth,
    clientId: string,
    clientSecret: string,
    key: string,
  ): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
    if (auth.scopes && auth.scopes.length > 0) body.set('scope', auth.scopes.join(' '));

    let response: Response;
    try {
      response = await this.fetchImpl(auth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      });
    } catch (error) {
      return { diagnostics: [tokenFailureDiagnostic(String((error as Error).message ?? error))] };
    }

    if (!response.ok) {
      return { diagnostics: [tokenFailureDiagnostic(`token endpoint returned ${response.status}`)] };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { diagnostics: [tokenFailureDiagnostic('response was not valid JSON')] };
    }

    const record = payload as Record<string, unknown>;
    const accessToken = record.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return { diagnostics: [tokenFailureDiagnostic('response missing "access_token"')] };
    }

    const expiresIn = record.expires_in;
    const ttlMs = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn * 1000 : DEFAULT_TTL_MS;
    this.cache.set(key, { accessToken, expiresAt: Date.now() + ttlMs });
    return { token: accessToken, diagnostics: [] };
  }
}
