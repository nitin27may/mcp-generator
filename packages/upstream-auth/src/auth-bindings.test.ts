import type { UpstreamAuthentication } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { authBindingsOf } from './auth-bindings.js';

describe('authBindingsOf', () => {
  it('extracts an apiKey binding under key "value"', () => {
    const auth: UpstreamAuthentication = {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
      value: { source: 'secret', name: 'API_KEY' },
    };
    expect(authBindingsOf(auth)).toEqual({ value: { source: 'secret', name: 'API_KEY' } });
  });

  it('extracts a bearer binding under key "token"', () => {
    const auth: UpstreamAuthentication = { type: 'bearer', token: { source: 'secret', name: 'TOKEN' } };
    expect(authBindingsOf(auth)).toEqual({ token: { source: 'secret', name: 'TOKEN' } });
  });

  it('extracts basic auth as two bindings, username and password', () => {
    const auth: UpstreamAuthentication = {
      type: 'basic',
      username: { source: 'static', value: 'svc' },
      password: { source: 'secret', name: 'PASSWORD' },
    };
    expect(authBindingsOf(auth)).toEqual({
      username: { source: 'static', value: 'svc' },
      password: { source: 'secret', name: 'PASSWORD' },
    });
  });
});
