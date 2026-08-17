import { describe, expect, it } from 'vitest';
import { api, op } from '../test-helpers.js';
import { noResolvableSecurity, noRuntimeServers } from './auth-runtime.js';

describe('ARA-AUTH-001 noResolvableSecurity', () => {
  it('flags an operation with no security requirement', () => {
    expect(noResolvableSecurity.evaluate(api([op({ security: [] })]))).toHaveLength(1);
  });
  it('does not flag an operation with a security requirement', () => {
    expect(noResolvableSecurity.evaluate(api([op({ security: [{ schemeName: 'bearerAuth', scopes: [] }] })]))).toHaveLength(0);
  });
});

describe('ARA-RT-001 noRuntimeServers', () => {
  it('flags a document with no servers', () => {
    expect(noRuntimeServers.evaluate(api([op()], { servers: [] }))).toHaveLength(1);
  });
  it('does not flag a document with at least one server', () => {
    expect(noRuntimeServers.evaluate(api([op()], { servers: [{ url: 'https://api.example.com' }] }))).toHaveLength(0);
  });
});
