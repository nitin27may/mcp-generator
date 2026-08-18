import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import type { CanonicalSecurityScheme } from '@mcpgen/domain';
import { deriveEnvNames } from './slug.js';

/** Why a scheme couldn't be seeded into a complete `UpstreamAuthentication` block. */
export type SeedAuthUnsupportedReason =
  | 'apikey-cookie'
  | 'oauth2-flow-unsupported'
  | 'openid-connect';

export type SeedAuthResult =
  | { readonly kind: 'seeded'; readonly auth: UpstreamAuthentication }
  | { readonly kind: 'unsupported'; readonly reason: SeedAuthUnsupportedReason };

/**
 * OAuth2/OIDC schemes are deliberately NOT seeded — `OAuth2ClientCredentialsAuthSchema.tokenUrl`
 * is `z.string().url()` and cannot be seeded blank, and a config born invalid at creation time
 * because of a guessed placeholder is worse than no seed at all. `CanonicalSecurityScheme` also
 * does not carry OAuth flow data (the adapter discards it) — capturing and seeding a real
 * `tokenUrl` is a separate, deliberately scoped follow-up.
 */
export function seedAuth(scheme: CanonicalSecurityScheme, slug: string): SeedAuthResult {
  const envNames = deriveEnvNames(slug);

  switch (scheme.type) {
    case 'apiKey': {
      // cookie-based API keys aren't a binding kind config-schema supports (P0 scope) —
      // mis-mapping to header would silently produce a wrong config, so leave it unseeded.
      if (scheme.in === 'cookie') return { kind: 'unsupported', reason: 'apikey-cookie' };
      return {
        kind: 'seeded',
        auth: {
          type: 'apiKey',
          in: scheme.in ?? 'header',
          name: scheme.paramName ?? 'X-API-Key',
          value: { source: 'secret', name: envNames.apiKey },
        },
      };
    }
    case 'http':
      if (scheme.scheme === 'basic') {
        return {
          kind: 'seeded',
          auth: {
            type: 'basic',
            username: { source: 'environment', name: envNames.username },
            password: { source: 'secret', name: envNames.password },
          },
        };
      }
      // Treat any other HTTP scheme (bearer, or an unrecognized one) as bearer — the closest fit.
      return { kind: 'seeded', auth: { type: 'bearer', token: { source: 'secret', name: envNames.token } } };
    case 'oauth2':
      return { kind: 'unsupported', reason: 'oauth2-flow-unsupported' };
    case 'openIdConnect':
      return { kind: 'unsupported', reason: 'openid-connect' };
  }
}

export interface SkippedScheme {
  readonly name: string;
  readonly reason: string;
}

export interface SchemeSelection {
  readonly chosen?: CanonicalSecurityScheme;
  readonly skipped: readonly SkippedScheme[];
}

/**
 * Preference order when a spec declares more than one security scheme — favors the schemes
 * `seedAuth` can actually turn into a complete config over blindly taking `securitySchemes[0]`.
 * Cookie-based apiKey ranks last rather than being excluded outright, so a spec that declares
 * only that scheme still gets a `chosen` result (and therefore a reported reason), instead of
 * silently seeding nothing.
 */
const SCHEME_RANK: ReadonlyArray<(scheme: CanonicalSecurityScheme) => boolean> = [
  (s) => s.type === 'http' && s.scheme === 'bearer',
  (s) => s.type === 'apiKey' && s.in === 'header',
  (s) => s.type === 'apiKey' && s.in === 'query',
  (s) => s.type === 'http' && s.scheme === 'basic',
  (s) => s.type === 'http',
  (s) => s.type === 'oauth2',
  (s) => s.type === 'openIdConnect',
  (s) => s.type === 'apiKey' && s.in === 'cookie',
];

function rankOf(scheme: CanonicalSecurityScheme): number {
  const rank = SCHEME_RANK.findIndex((test) => test(scheme));
  return rank === -1 ? SCHEME_RANK.length : rank;
}

export function selectSeedableScheme(schemes: readonly CanonicalSecurityScheme[]): SchemeSelection {
  if (schemes.length === 0) return { skipped: [] };

  let chosen = schemes[0]!;
  for (const scheme of schemes.slice(1)) {
    if (rankOf(scheme) < rankOf(chosen)) chosen = scheme;
  }

  const skipped = schemes
    .filter((scheme) => scheme !== chosen)
    .map((scheme) => ({ name: scheme.name, reason: 'a higher-priority security scheme was selected instead' }));

  return { chosen, skipped };
}
