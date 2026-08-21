import type { OAuth2ClientCredentialsAuth, UpstreamAuthentication } from '@mcpgen/config-schema';
import { describe, expect, it, vi } from 'vitest';
import { attachUpstreamAuth, type AuthTarget } from './attach-auth.js';
import { OAuthTokenProvider } from './oauth-token-provider.js';

function emptyTarget(): AuthTarget {
  return { headers: {}, query: new URLSearchParams() };
}

describe('attachUpstreamAuth — apiKey', () => {
  const auth: UpstreamAuthentication = {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
    value: { source: 'secret', name: 'API_KEY' },
  };

  it('attaches as a header when in: "header"', async () => {
    const { target, diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, { value: 'sk-live' });
    expect(target.headers['X-API-Key']).toBe('sk-live');
    expect(diagnostics).toEqual([]);
  });

  it('attaches as a query parameter when in: "query"', async () => {
    const queryAuth: UpstreamAuthentication = { ...auth, in: 'query', name: 'api_key' };
    const { target } = await attachUpstreamAuth(emptyTarget(), queryAuth, { value: 'sk-live' });
    expect(target.query.get('api_key')).toBe('sk-live');
  });

  it('produces AUT-001 when the value was not resolved', async () => {
    const { target, diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, {});
    expect(target.headers).toEqual({});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-001' });
  });
});

describe('attachUpstreamAuth — bearer', () => {
  const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'TOKEN' } };

  it('sets the Authorization header with the Bearer scheme', async () => {
    const { target, diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, { token: 'abc123' });
    expect(target.headers.Authorization).toBe('Bearer abc123');
    expect(diagnostics).toEqual([]);
  });

  it('produces AUT-001 when the token was not resolved', async () => {
    const { diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, {});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-001' });
  });
});

describe('attachUpstreamAuth — basic', () => {
  const auth: UpstreamAuthentication = {
    type: 'basic',
    username: { source: 'static', value: 'svc' },
    password: { source: 'secret', name: 'PW' },
  };

  it('base64-encodes "username:password" correctly', async () => {
    const { target, diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, {
      username: 'alice',
      password: 'hunter2',
    });
    // RFC 7617: base64(username ":" password)
    expect(target.headers.Authorization).toBe(`Basic ${Buffer.from('alice:hunter2').toString('base64')}`);
    expect(target.headers.Authorization).toBe('Basic YWxpY2U6aHVudGVyMg==');
    expect(diagnostics).toEqual([]);
  });

  it('produces AUT-001 for a missing username, without attempting a partial encode', async () => {
    const { target, diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, { password: 'x' });
    expect(target.headers.Authorization).toBeUndefined();
    expect(diagnostics).toEqual([{ severity: 'error', code: 'AUT-001', message: expect.stringContaining('username'), sourcePointer: expect.any(String) }]);
  });

  it('produces AUT-001 for both fields when neither resolved', async () => {
    const { diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, {});
    expect(diagnostics).toHaveLength(2);
  });
});

describe('attachUpstreamAuth — oauth2ClientCredentials', () => {
  const auth: OAuth2ClientCredentialsAuth = {
    type: 'oauth2ClientCredentials',
    tokenUrl: 'https://auth.example.com/token',
    clientId: { source: 'static', value: 'client-abc' },
    clientSecret: { source: 'secret', name: 'CLIENT_SECRET' },
    scopes: ['read', 'write'],
  };

  it('acquires a token via the provider and sets the Authorization header with the Bearer scheme', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }));
    const tokenProvider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const { target, diagnostics } = await attachUpstreamAuth(
      emptyTarget(),
      auth,
      { clientId: 'client-abc', clientSecret: 'shh' },
      { tokenProvider },
    );

    expect(target.headers.Authorization).toBe('Bearer tok-1');
    expect(diagnostics).toEqual([]);
    const [, requestInit] = fetchImpl.mock.calls[0]!;
    expect(String(requestInit?.body)).toContain('grant_type=client_credentials');
  });

  it('reuses a cached token across two attachUpstreamAuth calls sharing one provider (no second fetch)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: 'sk-tok-cached', expires_in: 3600 }), { status: 200 }));
    const tokenProvider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const resolved = { clientId: 'client-abc', clientSecret: 'shh' };

    await attachUpstreamAuth(emptyTarget(), auth, resolved, { tokenProvider });
    const second = await attachUpstreamAuth(emptyTarget(), auth, resolved, { tokenProvider });

    expect(second.target.headers.Authorization).toBe('Bearer sk-tok-cached');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('produces AUT-003 when the token endpoint returns a non-2xx status', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const tokenProvider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const { diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, { clientId: 'x', clientSecret: 'y' }, { tokenProvider });
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-003' });
  });

  it('produces AUT-001 when clientId/clientSecret were not resolved, without calling the token endpoint', async () => {
    const fetchImpl = vi.fn();
    const tokenProvider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const { diagnostics } = await attachUpstreamAuth(emptyTarget(), auth, {}, { tokenProvider });
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((d) => d.code === 'AUT-001')).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('attachUpstreamAuth — does not mutate the input target', () => {
  it('leaves the original headers object untouched', async () => {
    const original: AuthTarget = { headers: { Accept: 'application/json' }, query: new URLSearchParams() };
    const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'T' } };
    await attachUpstreamAuth(original, auth, { token: 'abc' });
    expect(original.headers).toEqual({ Accept: 'application/json' });
  });
});
