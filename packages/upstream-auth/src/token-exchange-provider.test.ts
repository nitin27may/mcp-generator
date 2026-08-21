import { describe, expect, it, vi } from 'vitest';
import { TokenExchangeProvider } from './token-exchange-provider.js';
import type { OAuth2TokenExchangeAuth } from '@mcpgen/config-schema';

const auth: OAuth2TokenExchangeAuth = {
  type: 'oauth2TokenExchange',
  tokenUrl: 'https://idp.example.com/token',
  clientId: { source: 'environment', name: 'CLIENT_ID' },
  clientSecret: { source: 'secret', name: 'CLIENT_SECRET' },
  audience: 'https://orders.example.com',
  scopes: ['orders:read'],
};

const SUBJECT = 'sk-e2e-caller-subject-token';

/** Typed with the real fetch signature so `mock.calls` carries the url and init, not an empty tuple. */
function respondWith(body: unknown, status = 200) {
  return vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response(JSON.stringify(body), { status }));
}

describe('TokenExchangeProvider — RFC 8693 (ADR-0010)', () => {
  it('sends the caller token as subject_token and returns the exchanged token', async () => {
    const fetchImpl = respondWith({ access_token: 'sk-e2e-exchanged', expires_in: 3600 });
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.exchange(auth, 'client-abc', 'shh', SUBJECT);

    expect(result.token).toBe('sk-e2e-exchanged');
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(body.get('subject_token')).toBe(SUBJECT);
    expect(body.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:access_token');
    expect(body.get('audience')).toBe('https://orders.example.com');
    expect(body.get('scope')).toBe('orders:read');
  });

  it('exchanges with the AUTHORIZATION SERVER, never the upstream API', async () => {
    // ADR-0010's whole distinction: the subject token goes back to the party that issued
    // it, which can already validate it. It must never be sent anywhere else.
    const fetchImpl = respondWith({ access_token: 'sk-e2e-exchanged', expires_in: 3600 });
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.exchange(auth, 'client-abc', 'shh', SUBJECT);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(auth.tokenUrl);
  });

  it('caches per caller, so one user does not reuse another user token', async () => {
    let issued = 0;
    const fetchImpl = vi.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(JSON.stringify({ access_token: `sk-e2e-issued-${++issued}`, expires_in: 3600 }), { status: 200 }),
    );
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const alice = await provider.exchange(auth, 'client-abc', 'shh', 'sk-e2e-alice-token');
    const bob = await provider.exchange(auth, 'client-abc', 'shh', 'sk-e2e-bob-token');
    const aliceAgain = await provider.exchange(auth, 'client-abc', 'shh', 'sk-e2e-alice-token');

    expect(fetchImpl).toHaveBeenCalledTimes(2); // one per distinct caller
    expect(aliceAgain.token).toBe(alice.token);
    expect(bob.token).not.toBe(alice.token);
  });

  it('deduplicates concurrent exchanges for the same caller', async () => {
    const fetchImpl = respondWith({ access_token: 'sk-e2e-exchanged', expires_in: 3600 });
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await Promise.all([
      provider.exchange(auth, 'client-abc', 'shh', SUBJECT),
      provider.exchange(auth, 'client-abc', 'shh', SUBJECT),
      provider.exchange(auth, 'client-abc', 'shh', SUBJECT),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses to exchange when there is no verified caller', async () => {
    // Falling back to the server's own identity here would silently turn a delegated
    // configuration into an impersonating one.
    const fetchImpl = respondWith({ access_token: 'sk-e2e-exchanged' });
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.exchange(auth, 'client-abc', 'shh', '');

    expect(result.token).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('AUT-003');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports AUT-003 without echoing the request when the endpoint rejects it', async () => {
    // An RFC 6749 error body can quote the request back, and the request holds the
    // subject token — so the diagnostic carries the status only.
    const fetchImpl = respondWith({ error: 'invalid_grant', error_description: SUBJECT }, 400);
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.exchange(auth, 'client-abc', 'shh', SUBJECT);

    expect(result.token).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('AUT-003');
    expect(result.diagnostics[0]?.message).not.toContain(SUBJECT);
  });

  it('surfaces a missing access_token rather than attaching undefined', async () => {
    const fetchImpl = respondWith({ token_type: 'Bearer' });
    const provider = new TokenExchangeProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.exchange(auth, 'client-abc', 'shh', SUBJECT);
    expect(result.diagnostics[0]?.message).toContain('access_token');
  });
});
