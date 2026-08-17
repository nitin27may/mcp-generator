import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { attachUpstreamAuth, type AuthTarget } from './attach-auth.js';

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

  it('attaches as a header when in: "header"', () => {
    const { target, diagnostics } = attachUpstreamAuth(emptyTarget(), auth, { value: 'sk-live' });
    expect(target.headers['X-API-Key']).toBe('sk-live');
    expect(diagnostics).toEqual([]);
  });

  it('attaches as a query parameter when in: "query"', () => {
    const queryAuth: UpstreamAuthentication = { ...auth, in: 'query', name: 'api_key' };
    const { target } = attachUpstreamAuth(emptyTarget(), queryAuth, { value: 'sk-live' });
    expect(target.query.get('api_key')).toBe('sk-live');
  });

  it('produces AUT-001 when the value was not resolved', () => {
    const { target, diagnostics } = attachUpstreamAuth(emptyTarget(), auth, {});
    expect(target.headers).toEqual({});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-001' });
  });
});

describe('attachUpstreamAuth — bearer', () => {
  const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'TOKEN' } };

  it('sets the Authorization header with the Bearer scheme', () => {
    const { target, diagnostics } = attachUpstreamAuth(emptyTarget(), auth, { token: 'abc123' });
    expect(target.headers.Authorization).toBe('Bearer abc123');
    expect(diagnostics).toEqual([]);
  });

  it('produces AUT-001 when the token was not resolved', () => {
    const { diagnostics } = attachUpstreamAuth(emptyTarget(), auth, {});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-001' });
  });
});

describe('attachUpstreamAuth — basic', () => {
  const auth: UpstreamAuthentication = {
    type: 'basic',
    username: { source: 'static', value: 'svc' },
    password: { source: 'secret', name: 'PW' },
  };

  it('base64-encodes "username:password" correctly', () => {
    const { target, diagnostics } = attachUpstreamAuth(emptyTarget(), auth, {
      username: 'alice',
      password: 'hunter2',
    });
    // RFC 7617: base64(username ":" password)
    expect(target.headers.Authorization).toBe(`Basic ${Buffer.from('alice:hunter2').toString('base64')}`);
    expect(target.headers.Authorization).toBe('Basic YWxpY2U6aHVudGVyMg==');
    expect(diagnostics).toEqual([]);
  });

  it('produces AUT-001 for a missing username, without attempting a partial encode', () => {
    const { target, diagnostics } = attachUpstreamAuth(emptyTarget(), auth, { password: 'x' });
    expect(target.headers.Authorization).toBeUndefined();
    expect(diagnostics).toEqual([{ severity: 'error', code: 'AUT-001', message: expect.stringContaining('username'), sourcePointer: expect.any(String) }]);
  });

  it('produces AUT-001 for both fields when neither resolved', () => {
    const { diagnostics } = attachUpstreamAuth(emptyTarget(), auth, {});
    expect(diagnostics).toHaveLength(2);
  });
});

describe('attachUpstreamAuth — does not mutate the input target', () => {
  it('leaves the original headers object untouched', () => {
    const original: AuthTarget = { headers: { Accept: 'application/json' }, query: new URLSearchParams() };
    const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'T' } };
    attachUpstreamAuth(original, auth, { token: 'abc' });
    expect(original.headers).toEqual({ Accept: 'application/json' });
  });
});
