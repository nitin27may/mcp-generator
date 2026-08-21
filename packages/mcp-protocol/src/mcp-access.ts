import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  checkResourceAllowed,
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  verifyBearerToken,
  type AuthInfo,
  type OAuthMetadata,
} from '@modelcontextprotocol/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Plane A — authorization for inbound MCP requests (ADR-0005, FR-AUTH-MCP-002/003/004,
 * `P6-W23-E01`).
 *
 * This server acts as an OAuth 2.0 Resource Server, which under MCP 2026-07-28 means
 * three obligations, none of which involve performing a redirect:
 *
 *   1. Publish RFC 9728 Protected Resource Metadata so a client can find the
 *      authorization server on its own.
 *   2. Answer an unauthenticated request with `401` and a `WWW-Authenticate` header
 *      pointing at that document.
 *   3. Reject a token that was not issued *for this server*. The audience check is a
 *      normative MUST — without it, a token minted for any other service protected by
 *      the same authorization server would be accepted here. That is the confused-deputy
 *      bug tracked as R11.
 *
 * The authorization-code redirect belongs entirely to the client: it opens the browser,
 * receives the callback, and exchanges the code. Nothing in this file initiates one.
 *
 * The SDK owns bearer parsing, scope enforcement and the challenge responses
 * (research notes §8). What is ours is the part the SDK deliberately leaves open: how a
 * token is actually validated. That is the `OAuthTokenVerifier` built below.
 */

export interface McpAccessConfig {
  /** Authorization server issuer identifier; its metadata and keys are discovered from here. */
  readonly issuer: string;
  /** This server's public URL. RFC 9728 discovery is derived from it, so it must be a URL. */
  readonly resource: string;
  /** What `aud` is checked against, when the authorization server does not mint the resource URL. */
  readonly audience?: string;
  /** Overrides the discovered `jwks_uri`. */
  readonly jwksUri?: string;
  /** Scopes every caller must present; a token missing any is refused `403`. */
  readonly requiredScopes?: readonly string[];
  /** Permits an `http://` issuer. Local testing only. */
  readonly dangerouslyAllowInsecureIssuer?: boolean;
  /** Advertised as `resource_name` in the metadata document. */
  readonly resourceName?: string;
}

export interface McpAccessGate {
  /** The configured RFC 8707 resource identifier. */
  readonly resource: string;
  /** The discovered authorization server metadata, as published to clients. */
  readonly authorizationServerMetadata: OAuthMetadata;
  /**
   * Serves the RFC 9728 / RFC 8414 discovery documents. Returns `undefined` when the
   * request is not for one of them, so the caller can fall through to its own routing.
   */
  metadata(request: Request): Response | undefined;
  /**
   * Resolves to the verified caller, or to a ready-to-return `401`/`403` challenge.
   * Mirrors the SDK's `requireBearerAuth` gate shape.
   */
  authorize(request: Request): Promise<AuthInfo | Response>;
}

/** Injection seam for tests — a fixture IdP served over loopback rather than the network. */
export interface McpAccessDependencies {
  readonly fetchImpl?: typeof fetch;
}

const WELL_KNOWN_OAUTH = '/.well-known/oauth-authorization-server';
const WELL_KNOWN_OIDC = '/.well-known/openid-configuration';

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/**
 * RFC 8414 §3.1 puts the well-known segment *before* the issuer's path component, which
 * is the opposite of how OpenID Connect Discovery does it. Authorization servers vary in
 * which they answer — Keycloak serves both — so both are attempted, RFC 8414 first.
 */
function discoveryUrls(issuer: URL): string[] {
  const path = issuer.pathname.replace(/\/$/, '');
  const origin = issuer.origin;
  if (path === '') return [`${origin}${WELL_KNOWN_OAUTH}`, `${origin}${WELL_KNOWN_OIDC}`];
  return [`${origin}${WELL_KNOWN_OAUTH}${path}`, `${origin}${path}${WELL_KNOWN_OIDC}`];
}

async function discoverAuthorizationServer(issuer: URL, fetchImpl: typeof fetch): Promise<OAuthMetadata> {
  const attempted: string[] = [];
  for (const url of discoveryUrls(issuer)) {
    attempted.push(url);
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { accept: 'application/json' } });
    } catch {
      continue; // Network-level failure on one shape; try the other before giving up.
    }
    if (!response.ok) continue;
    const metadata = (await response.json()) as OAuthMetadata;
    // An issuer mismatch is an active attack shape, not a misconfiguration to paper over:
    // it means the document we just fetched describes somebody else.
    if (metadata.issuer !== issuer.href && metadata.issuer !== issuer.href.replace(/\/$/, '')) {
      throw new Error(
        `authorization server metadata at ${url} declares issuer "${metadata.issuer}", which does not match the configured issuer "${issuer.href}"`,
      );
    }
    return metadata;
  }
  throw new Error(`could not discover authorization server metadata for "${issuer.href}" (tried: ${attempted.join(', ')})`);
}

/** RFC 8693 / RFC 9068: `scope` is space-delimited, `scp` is an array. Accept either. */
function scopesOf(payload: Record<string, unknown>): string[] {
  const scope = payload['scope'];
  if (typeof scope === 'string') return scope.split(' ').filter(Boolean);
  const scp = payload['scp'];
  if (Array.isArray(scp)) return scp.filter((s): s is string => typeof s === 'string');
  return [];
}

function audiencesOf(payload: Record<string, unknown>): string[] {
  const aud = payload['aud'];
  if (typeof aud === 'string') return [aud];
  if (Array.isArray(aud)) return aud.filter((a): a is string => typeof a === 'string');
  return [];
}

/**
 * True when any `aud` value names this server.
 *
 * Two forms are accepted, because real authorization servers disagree about what an
 * audience is. MCP and RFC 8707 model it as a resource URL, and `checkResourceAllowed`
 * implements that properly, including the hierarchical path rule. But Keycloak mints a
 * client id (`orders-api`), Entra ID mints `api://<guid>`, and Auth0 mints an arbitrary
 * API identifier — none of which parse as a URL. Accepting only the URL form would leave
 * Plane A unusable against most enterprise identity providers.
 *
 * The non-URL case is exact string equality and nothing looser. That is the same strength
 * of check: it still answers "was this token minted for me, specifically". What it does
 * not do is prefix or substring matching, which would let `orders-api-staging` satisfy a
 * server configured as `orders-api`.
 */
function audienceMatches(audiences: readonly string[], resource: string): boolean {
  return audiences.some((audience) => {
    if (audience === resource) return true;
    try {
      return checkResourceAllowed({ requestedResource: audience, configuredResource: resource });
    } catch {
      // Not a URL, and not an exact match — nothing further to try.
      return false;
    }
  });
}

export async function createMcpAccessGate(
  config: McpAccessConfig,
  deps: McpAccessDependencies = {},
): Promise<McpAccessGate> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  let issuer: URL;
  try {
    issuer = new URL(config.issuer);
  } catch {
    throw new Error(`mcpAccess.issuer is not a valid URL: "${config.issuer}"`);
  }
  let resourceUrl: URL;
  try {
    resourceUrl = new URL(config.resource);
  } catch {
    throw new Error(`mcpAccess.resource is not a valid URL: "${config.resource}"`);
  }

  const insecure = issuer.protocol !== 'https:';
  if (insecure && !config.dangerouslyAllowInsecureIssuer) {
    throw new Error(
      `mcpAccess.issuer "${issuer.href}" is not https. Tokens and discovery documents would cross the wire unprotected. ` +
        `Set mcpAccess.dangerouslyAllowInsecureIssuer if this is a local test identity provider.`,
    );
  }
  if (insecure && !isLoopback(issuer.hostname)) {
    // The escape hatch exists for a fixture IdP on loopback. Letting it cover a remote
    // plaintext issuer would turn a testing convenience into a production foot-gun.
    throw new Error(
      `mcpAccess.dangerouslyAllowInsecureIssuer permits a plaintext issuer only on loopback, not "${issuer.hostname}"`,
    );
  }

  const expectedAudience = config.audience ?? resourceUrl.href;

  const metadata = await discoverAuthorizationServer(issuer, fetchImpl);
  const jwksUri = config.jwksUri ?? metadata.jwks_uri;
  if (!jwksUri) {
    throw new Error(
      `authorization server "${issuer.href}" published no jwks_uri and none was configured — tokens cannot be verified`,
    );
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri), {
    // The SDK rejects a token without an expiry, so a short cooldown is enough to absorb
    // a key rotation without turning every request into a JWKS fetch.
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
  });

  const verifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: Record<string, unknown>;
      try {
        // Signature, `iss`, `exp` and `nbf` are all enforced here. Audience is checked
        // separately below so a mismatch can carry a message that names the expectation.
        const verified = await jwtVerify(token, jwks, { issuer: metadata.issuer });
        payload = verified.payload as Record<string, unknown>;
      } catch (error) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          `access token failed verification: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const audiences = audiencesOf(payload);
      if (!audienceMatches(audiences, expectedAudience)) {
        // Deliberately does not echo the token or its full claim set — an error body is a
        // place secrets leak from (ADR-0006, R6).
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          `access token audience ${JSON.stringify(audiences)} does not include this server's expected audience "${expectedAudience}"`,
        );
      }

      const exp = payload['exp'];
      if (typeof exp !== 'number') {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'access token has no exp claim');
      }

      const clientId = payload['client_id'] ?? payload['azp'] ?? payload['sub'];
      return {
        token,
        clientId: typeof clientId === 'string' ? clientId : '',
        scopes: scopesOf(payload),
        expiresAt: exp,
        resource: resourceUrl,
        extra: { subject: typeof payload['sub'] === 'string' ? payload['sub'] : undefined },
      };
    },
  };

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);
  const requiredScopes = config.requiredScopes ? [...config.requiredScopes] : undefined;
  const metadataOptions = {
    oauthMetadata: metadata,
    resourceServerUrl: resourceUrl,
    ...(requiredScopes ? { scopesSupported: requiredScopes } : {}),
    ...(config.resourceName ? { resourceName: config.resourceName } : {}),
    ...(insecure ? { dangerouslyAllowInsecureIssuerUrl: true } : {}),
  };

  return {
    resource: resourceUrl.href,
    authorizationServerMetadata: metadata,
    metadata: (request) => oauthMetadataResponse(request, metadataOptions),
    authorize: async (request) => {
      const bearerOptions = {
        verifier,
        resourceMetadataUrl,
        ...(requiredScopes ? { requiredScopes } : {}),
      };
      try {
        return await verifyBearerToken(request.headers.get('authorization'), bearerOptions);
      } catch (error) {
        // Maps invalid_token to 401 and insufficient_scope to 403, both carrying the
        // WWW-Authenticate challenge with resource_metadata so a client can discover
        // the authorization server and retry.
        return bearerAuthChallengeResponse(error, bearerOptions);
      }
    },
  };
}
