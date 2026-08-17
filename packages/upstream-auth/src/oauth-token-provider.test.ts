import type { OAuth2ClientCredentialsAuth } from '@mcpgen/config-schema';
import { describe, expect, it, vi } from 'vitest';
import { OAuthTokenProvider } from './oauth-token-provider.js';

const AUTH: OAuth2ClientCredentialsAuth = {
  type: 'oauth2ClientCredentials',
  tokenUrl: 'https://auth.example.com/token',
  clientId: { source: 'static', value: 'client-abc' },
  clientSecret: { source: 'secret', name: 'CLIENT_SECRET' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('OAuthTokenProvider', () => {
  it('fetches a token with the RFC 6749 client_credentials grant, including scopes when configured', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) => jsonResponse({ access_token: 'tok', expires_in: 3600 }));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.getAccessToken({ ...AUTH, scopes: ['read', 'write'] }, 'id', 'secret');

    expect(result).toEqual({ token: 'tok', diagnostics: [] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(AUTH.tokenUrl);
    const body = String(init?.body);
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=id');
    expect(body).toContain('client_secret=secret');
    expect(body).toContain('scope=read+write');
  });

  it('caches the token and does not re-fetch while it is still valid', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: 'tok', expires_in: 3600 }));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await provider.getAccessToken(AUTH, 'id', 'secret');
    await provider.getAccessToken(AUTH, 'id', 'secret');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the cached token is within the expiry safety margin', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 10 })) // expires in 10s, under the 30s safety margin
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-2', expires_in: 3600 }));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const first = await provider.getAccessToken(AUTH, 'id', 'secret');
    const second = await provider.getAccessToken(AUTH, 'id', 'secret');

    expect(first.token).toBe('tok-1');
    expect(second.token).toBe('tok-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent requests for the same credentials into one token-endpoint call (acquire lock)', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const first = provider.getAccessToken(AUTH, 'id', 'secret');
    const second = provider.getAccessToken(AUTH, 'id', 'secret');
    resolveFetch(jsonResponse({ access_token: 'tok', expires_in: 3600 }));

    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.token).toBe('tok');
    expect(r2.token).toBe('tok');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches per clientId/scopes — different credentials get independent tokens', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-a', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-b', expires_in: 3600 }));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const a = await provider.getAccessToken(AUTH, 'client-a', 'secret');
    const b = await provider.getAccessToken(AUTH, 'client-b', 'secret');

    expect(a.token).toBe('tok-a');
    expect(b.token).toBe('tok-b');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('produces AUT-003 on a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.getAccessToken(AUTH, 'id', 'secret');
    expect(result.token).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-003' });
  });

  it('produces AUT-003 when the response is missing access_token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ token_type: 'Bearer' }));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.getAccessToken(AUTH, 'id', 'secret');
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-003', message: expect.stringContaining('access_token') });
  });

  it('produces AUT-003 when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
    const provider = new OAuthTokenProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.getAccessToken(AUTH, 'id', 'secret');
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-003' });
  });
});
