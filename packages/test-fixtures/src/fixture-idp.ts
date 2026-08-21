import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type CryptoKey } from 'jose';

/**
 * A real, minimal OAuth 2.1 authorization server for tests.
 *
 * The `client_credentials` half of this already existed, copy-pasted into two E2E test
 * files. Promoting it here and growing it into a full IdP is what makes Plane A testable:
 * verifying an inbound token means something only if a real key signed it, a real JWKS
 * publishes that key, and a real discovery document points at both.
 *
 * It implements, over loopback, with a per-run RS256 keypair:
 *   - RFC 8414 authorization server metadata
 *   - a JWKS endpoint
 *   - RFC 7591 dynamic client registration
 *   - `authorization_code` with mandatory PKCE (S256)
 *   - `client_credentials`
 *   - RFC 8693 token exchange
 *   - RFC 8707 resource indicators, so `aud` reflects what was actually asked for
 *
 * `/authorize` auto-consents rather than rendering a login page. The redirect is real —
 * it answers `302` to the client's callback with a code — but there is no human to click
 * through, which is what lets the whole loop run headless in CI. A browser-visible login
 * is the Keycloak sandbox's job, not this one.
 *
 * The `mint*` helpers exist for the cases that matter most: tokens that must be REJECTED.
 * Producing a wrong-audience or foreign-signed token through the normal flow is awkward;
 * minting one directly is not.
 */

export interface FixtureIdpClient {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUris?: readonly string[];
}

export interface FixtureIdpOptions {
  /** Pre-registered clients. Dynamic registration adds more at run time. */
  readonly clients?: readonly FixtureIdpClient[];
  /** `aud` used when a request carries no `resource` indicator. */
  readonly defaultAudience?: string;
  /** Access token lifetime. @default 3600 */
  readonly tokenTtlSeconds?: number;
}

export interface MintTokenOptions {
  readonly subject?: string;
  readonly clientId?: string;
  readonly audience?: string | readonly string[];
  readonly scopes?: readonly string[];
  /** Seconds from now. Negative mints an already-expired token. @default 3600 */
  readonly expiresInSeconds?: number;
  /** Overrides the issuer claim, for testing issuer-mismatch rejection. */
  readonly issuer?: string;
  /** Sign with a key that is NOT in the published JWKS. */
  readonly useForeignKey?: boolean;
  /** Omit the `exp` claim entirely — the SDK refuses such tokens. */
  readonly omitExpiry?: boolean;
}

export interface FixtureIdpRequestLog {
  readonly method: string;
  readonly url: string;
}

export interface FixtureIdpHandle {
  readonly issuer: string;
  readonly jwksUri: string;
  readonly tokenEndpoint: string;
  readonly authorizationEndpoint: string;
  readonly registrationEndpoint: string;
  readonly requests: FixtureIdpRequestLog[];
  /** Registers a client after startup, mirroring what DCR would have created. */
  addClient(client: FixtureIdpClient): void;
  mintAccessToken(options?: MintTokenOptions): Promise<string>;
  stop(): Promise<void>;
}

interface PendingAuthorization {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly scope: string;
  readonly resource: string | undefined;
}

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function oauthError(res: ServerResponse, status: number, error: string, description: string): void {
  send(res, status, { error, error_description: description });
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

/** RFC 7636 §4.2: BASE64URL(SHA256(verifier)). */
function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function startFixtureIdp(options: FixtureIdpOptions = {}): Promise<FixtureIdpHandle> {
  const ttl = options.tokenTtlSeconds ?? 3600;
  const signing = await generateKeyPair('RS256', { extractable: true });
  const foreign = await generateKeyPair('RS256', { extractable: true });
  const kid = randomUUID();
  const publicJwk: JWK = { ...(await exportJWK(signing.publicKey)), kid, alg: 'RS256', use: 'sig' };

  const clients = new Map<string, FixtureIdpClient>();
  for (const client of options.clients ?? []) clients.set(client.clientId, client);

  const codes = new Map<string, PendingAuthorization>();
  const requests: FixtureIdpRequestLog[] = [];

  let issuer = '';

  async function mint(opts: MintTokenOptions = {}): Promise<string> {
    const audience = opts.audience ?? options.defaultAudience ?? issuer;
    const key: CryptoKey = (opts.useForeignKey ? foreign.privateKey : signing.privateKey) as CryptoKey;
    let jwt = new SignJWT({
      scope: (opts.scopes ?? []).join(' '),
      client_id: opts.clientId ?? 'fixture-client',
    })
      .setProtectedHeader({ alg: 'RS256', kid: opts.useForeignKey ? randomUUID() : kid })
      .setIssuer(opts.issuer ?? issuer)
      .setSubject(opts.subject ?? 'fixture-user')
      .setAudience(Array.isArray(opts.audience) ? [...opts.audience] : (audience as string))
      .setIssuedAt();
    if (!opts.omitExpiry) {
      jwt = jwt.setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? ttl));
    }
    return jwt.sign(key);
  }

  async function tokenResponse(res: ServerResponse, opts: MintTokenOptions): Promise<void> {
    send(res, 200, {
      access_token: await mint(opts),
      token_type: 'Bearer',
      expires_in: opts.expiresInSeconds ?? ttl,
      ...(opts.scopes?.length ? { scope: opts.scopes.join(' ') } : {}),
    });
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', issuer || 'http://fixture-idp.local');
      requests.push({ method: req.method ?? '', url: req.url ?? '' });

      // RFC 8414 and OIDC Discovery. Both shapes are served because clients differ in
      // which they probe, and a real IdP (Keycloak) answers both too.
      if (url.pathname === '/.well-known/oauth-authorization-server' || url.pathname === '/.well-known/openid-configuration') {
        return send(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'client_credentials', TOKEN_EXCHANGE_GRANT],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
          scopes_supported: ['mcp:tools', 'orders:read', 'orders:write'],
        });
      }

      if (url.pathname === '/jwks') {
        return send(res, 200, { keys: [publicJwk] });
      }

      // RFC 7591. Accepts anything, which is the point: an MCP client that has never
      // been configured must be able to register itself and proceed.
      if (url.pathname === '/register' && req.method === 'POST') {
        const body = await readJson(req);
        const clientId = `dcr-${randomUUID()}`;
        const redirectUris = Array.isArray(body['redirect_uris']) ? (body['redirect_uris'] as string[]) : [];
        clients.set(clientId, { clientId, redirectUris });
        return send(res, 201, {
          client_id: clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          redirect_uris: redirectUris,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code'],
          response_types: ['code'],
        });
      }

      if (url.pathname === '/authorize') {
        const params = url.searchParams;
        const clientId = params.get('client_id') ?? '';
        const redirectUri = params.get('redirect_uri') ?? '';
        const challenge = params.get('code_challenge') ?? '';
        const method = params.get('code_challenge_method') ?? '';

        if (!clients.has(clientId)) return oauthError(res, 400, 'invalid_client', `unknown client_id "${clientId}"`);
        if (!redirectUri) return oauthError(res, 400, 'invalid_request', 'redirect_uri is required');
        // PKCE is mandatory in OAuth 2.1 and MCP requires S256 specifically.
        if (!challenge || method !== 'S256') {
          return oauthError(res, 400, 'invalid_request', 'code_challenge with code_challenge_method=S256 is required');
        }

        const code = randomUUID();
        codes.set(code, {
          clientId,
          redirectUri,
          codeChallenge: challenge,
          scope: params.get('scope') ?? '',
          resource: params.get('resource') ?? undefined,
        });

        // The redirect a browser would follow. No consent screen: there is no human here.
        const location = new URL(redirectUri);
        location.searchParams.set('code', code);
        const state = params.get('state');
        if (state) location.searchParams.set('state', state);
        res.writeHead(302, { location: location.href });
        return res.end();
      }

      if (url.pathname === '/token' && req.method === 'POST') {
        const form = await readForm(req);
        const grant = form.get('grant_type') ?? '';
        const resource = form.get('resource') ?? undefined;
        const scopes = (form.get('scope') ?? '').split(' ').filter(Boolean);

        if (grant === 'authorization_code') {
          const code = form.get('code') ?? '';
          const pending = codes.get(code);
          if (!pending) return oauthError(res, 400, 'invalid_grant', 'unknown or already-redeemed code');
          codes.delete(code); // single use, as required
          const verifier = form.get('code_verifier') ?? '';
          if (s256(verifier) !== pending.codeChallenge) {
            return oauthError(res, 400, 'invalid_grant', 'code_verifier does not match the code_challenge');
          }
          if ((form.get('redirect_uri') ?? '') !== pending.redirectUri) {
            return oauthError(res, 400, 'invalid_grant', 'redirect_uri does not match the authorization request');
          }
          const audience = resource ?? pending.resource;
          return tokenResponse(res, {
            clientId: pending.clientId,
            scopes: pending.scope ? pending.scope.split(' ').filter(Boolean) : scopes,
            ...(audience ? { audience } : {}),
          });
        }

        if (grant === 'client_credentials') {
          const clientId = form.get('client_id') ?? '';
          const client = clients.get(clientId);
          if (!client) return oauthError(res, 401, 'invalid_client', `unknown client_id "${clientId}"`);
          if (client.clientSecret && form.get('client_secret') !== client.clientSecret) {
            return oauthError(res, 401, 'invalid_client', 'client authentication failed');
          }
          return tokenResponse(res, { clientId, subject: clientId, scopes, ...(resource ? { audience: resource } : {}) });
        }

        // RFC 8693. The MCP server presents the caller's token as the subject and gets
        // back one scoped to the upstream API — which is how a request acts on the
        // user's behalf without the inbound token ever reaching the upstream (ADR-0005).
        if (grant === TOKEN_EXCHANGE_GRANT) {
          const subjectToken = form.get('subject_token') ?? '';
          if (!subjectToken) return oauthError(res, 400, 'invalid_request', 'subject_token is required');
          const clientId = form.get('client_id') ?? '';
          const client = clients.get(clientId);
          if (!client) return oauthError(res, 401, 'invalid_client', `unknown client_id "${clientId}"`);
          if (client.clientSecret && form.get('client_secret') !== client.clientSecret) {
            return oauthError(res, 401, 'invalid_client', 'client authentication failed');
          }
          const audience = form.get('audience') ?? resource;
          const exchanged = await mint({
            clientId,
            subject: 'fixture-user',
            scopes,
            ...(audience ? { audience } : {}),
          });
          return send(res, 200, {
            access_token: exchanged,
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            token_type: 'Bearer',
            expires_in: ttl,
            ...(scopes.length ? { scope: scopes.join(' ') } : {}),
          });
        }

        return oauthError(res, 400, 'unsupported_grant_type', `grant_type "${grant}" is not supported`);
      }

      send(res, 404, { error: 'not_found' });
    })().catch(() => {
      if (!res.headersSent) oauthError(res, 500, 'server_error', 'fixture idp failure');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  issuer = `http://127.0.0.1:${port}`;

  return {
    issuer,
    jwksUri: `${issuer}/jwks`,
    tokenEndpoint: `${issuer}/token`,
    authorizationEndpoint: `${issuer}/authorize`,
    registrationEndpoint: `${issuer}/register`,
    requests,
    addClient: (client) => clients.set(client.clientId, client),
    mintAccessToken: mint,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
