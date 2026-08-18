import { describe, expect, it } from 'vitest';
import type { CanonicalSecurityScheme } from '@mcpgen/domain';
import { seedAuth, selectSeedableScheme } from './seed-auth.js';

const bearer: CanonicalSecurityScheme = { name: 'bearerAuth', type: 'http', scheme: 'bearer' };
const apiKeyHeader: CanonicalSecurityScheme = { name: 'apiKeyAuth', type: 'apiKey', in: 'header' };
const apiKeyQuery: CanonicalSecurityScheme = { name: 'apiKeyQuery', type: 'apiKey', in: 'query' };
const apiKeyCookie: CanonicalSecurityScheme = { name: 'apiKeyCookie', type: 'apiKey', in: 'cookie' };
const basic: CanonicalSecurityScheme = { name: 'basicAuth', type: 'http', scheme: 'basic' };
const oauth2: CanonicalSecurityScheme = { name: 'oauth2Auth', type: 'oauth2' };
const oauth2ClientCredentials: CanonicalSecurityScheme = {
  name: 'oauth2Auth',
  type: 'oauth2',
  oauth2Flows: { clientCredentials: { tokenUrl: 'https://example.com/token', scopes: ['read'] } },
};
const oidc: CanonicalSecurityScheme = { name: 'oidcAuth', type: 'openIdConnect' };

describe('seedAuth', () => {
  it('seeds apiKey/bearer/basic as secret or environment bindings', () => {
    expect(seedAuth(apiKeyHeader, 'customer-api')).toMatchObject({ kind: 'seeded', auth: { type: 'apiKey', value: { source: 'secret' } } });
    expect(seedAuth(bearer, 'customer-api')).toMatchObject({ kind: 'seeded', auth: { type: 'bearer', token: { source: 'secret' } } });
    expect(seedAuth(basic, 'customer-api')).toMatchObject({
      kind: 'seeded',
      auth: { type: 'basic', username: { source: 'environment' }, password: { source: 'secret' } },
    });
  });

  it('reports cookie apiKey, oauth2-without-clientCredentials, and openIdConnect as unsupported rather than guessing', () => {
    expect(seedAuth(apiKeyCookie, 'customer-api')).toEqual({ kind: 'unsupported', reason: 'apikey-cookie' });
    expect(seedAuth(oauth2, 'customer-api')).toEqual({ kind: 'unsupported', reason: 'oauth2-flow-unsupported' });
    expect(seedAuth(oidc, 'customer-api')).toEqual({ kind: 'unsupported', reason: 'openid-connect' });
  });

  it('seeds a complete oauth2ClientCredentials config when the scheme declares a real clientCredentials flow', () => {
    expect(seedAuth(oauth2ClientCredentials, 'customer-api')).toMatchObject({
      kind: 'seeded',
      auth: {
        type: 'oauth2ClientCredentials',
        tokenUrl: 'https://example.com/token',
        clientId: { source: 'environment', name: 'CUSTOMER_API_CLIENT_ID' },
        clientSecret: { source: 'secret', name: 'CUSTOMER_API_CLIENT_SECRET' },
        scopes: ['read'],
      },
    });
  });
});

describe('selectSeedableScheme', () => {
  it('returns no selection for an empty scheme list', () => {
    expect(selectSeedableScheme([])).toEqual({ skipped: [] });
  });

  it('prefers bearer over apiKey, and apiKey-header over apiKey-query, regardless of declaration order', () => {
    expect(selectSeedableScheme([apiKeyHeader, bearer]).chosen).toBe(bearer);
    expect(selectSeedableScheme([apiKeyQuery, apiKeyHeader]).chosen).toBe(apiKeyHeader);
  });

  it('still selects a cookie-based apiKey scheme when it is the only one, so it gets reported rather than silently dropped', () => {
    const selection = selectSeedableScheme([apiKeyCookie]);
    expect(selection.chosen).toBe(apiKeyCookie);
    expect(selection.skipped).toEqual([]);
  });

  it('reports every non-chosen scheme as skipped', () => {
    const selection = selectSeedableScheme([apiKeyQuery, bearer, oauth2]);
    expect(selection.chosen).toBe(bearer);
    expect(selection.skipped.map((s) => s.name).sort()).toEqual(['apiKeyQuery', 'oauth2Auth'].sort());
  });
});
