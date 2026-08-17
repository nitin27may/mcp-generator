import { describe, expect, it } from 'vitest';
import { UpstreamAuthenticationSchema } from './upstream-auth.js';

describe('UpstreamAuthenticationSchema — TIP §19 V1 trio', () => {
  it('accepts apiKey in header', () => {
    const result = UpstreamAuthenticationSchema.safeParse({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
      value: { source: 'secret', name: 'API_KEY' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts apiKey in query', () => {
    expect(
      UpstreamAuthenticationSchema.safeParse({
        type: 'apiKey',
        in: 'query',
        name: 'api_key',
        value: { source: 'secret', name: 'API_KEY' },
      }).success,
    ).toBe(true);
  });

  it('accepts bearer', () => {
    expect(
      UpstreamAuthenticationSchema.safeParse({
        type: 'bearer',
        token: { source: 'secret', name: 'TOKEN' },
      }).success,
    ).toBe(true);
  });

  it('accepts basic with a secret-bound password', () => {
    expect(
      UpstreamAuthenticationSchema.safeParse({
        type: 'basic',
        username: { source: 'static', value: 'svc-account' },
        password: { source: 'secret', name: 'PASSWORD' },
      }).success,
    ).toBe(true);
  });

  it('rejects basic with a non-secret password binding — a password is always a secret', () => {
    const result = UpstreamAuthenticationSchema.safeParse({
      type: 'basic',
      username: { source: 'static', value: 'svc-account' },
      password: { source: 'static', value: 'hunter2' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized type', () => {
    expect(UpstreamAuthenticationSchema.safeParse({ type: 'digest' }).success).toBe(false);
  });
});
