import { describe, expect, it } from 'vitest';
import { REDACTED, redactHeaders, redactString, redactValue } from './redact.js';

describe('redactString', () => {
  it('replaces a secret value embedded mid-string', () => {
    expect(redactString('Bearer sk-test-sentinel', { secretValues: ['sk-test-sentinel'] })).toBe(
      `Bearer ${REDACTED}`,
    );
  });

  it('replaces every occurrence, not just the first', () => {
    expect(redactString('a=x&b=x', { secretValues: ['x'] })).toBe(`a=${REDACTED}&b=${REDACTED}`);
  });

  it('leaves the string unchanged when no secret matches', () => {
    expect(redactString('nothing sensitive here', { secretValues: ['sk-other'] })).toBe(
      'nothing sensitive here',
    );
  });

  it('ignores an empty-string secret rather than redacting everything', () => {
    expect(redactString('hello', { secretValues: [''] })).toBe('hello');
  });
});

describe('redactHeaders', () => {
  it('redacts default sensitive headers case-insensitively', () => {
    const out = redactHeaders({ Authorization: 'Bearer abc', 'X-Trace-Id': 't-1' });
    expect(out.Authorization).toBe(REDACTED);
    expect(out['X-Trace-Id']).toBe('t-1');
  });

  it('redacts Cookie and Set-Cookie', () => {
    const out = redactHeaders({ cookie: 'a=1', 'Set-Cookie': 'b=2' });
    expect(out.cookie).toBe(REDACTED);
    expect(out['Set-Cookie']).toBe(REDACTED);
  });

  it('redacts X-API-Key style variants via pattern, not just exact match', () => {
    const out = redactHeaders({ 'X-Api-Key': 'k', 'x_api_key': 'k2', ApiKey: 'k3' });
    expect(out['X-Api-Key']).toBe(REDACTED);
    expect(out['x_api_key']).toBe(REDACTED);
    expect(out.ApiKey).toBe(REDACTED);
  });

  it('accepts extra caller-supplied sensitive header names', () => {
    const out = redactHeaders({ 'X-Tenant-Secret': 'v' }, { sensitiveHeaderNames: ['X-Tenant-Secret'] });
    expect(out['X-Tenant-Secret']).toBe(REDACTED);
  });

  it('still scrubs secret substrings inside non-sensitive header values', () => {
    const out = redactHeaders({ 'X-Debug': 'token=sk-sentinel' }, { secretValues: ['sk-sentinel'] });
    expect(out['X-Debug']).toBe(`token=${REDACTED}`);
  });
});

describe('redactValue', () => {
  it('scrubs a secret value nested inside an object', () => {
    const out = redactValue({ url: 'https://api.example.com?key=sk-sentinel' }, {
      secretValues: ['sk-sentinel'],
    }) as Record<string, string>;
    expect(out.url).toBe('https://api.example.com?key=' + REDACTED);
  });

  it('scrubs a secret value nested inside an array', () => {
    const out = redactValue(['a', 'sk-sentinel', 'b'], { secretValues: ['sk-sentinel'] });
    expect(out).toEqual(['a', REDACTED, 'b']);
  });

  it('masks a key that looks like a sensitive header anywhere in the tree, not just at the top', () => {
    const out = redactValue({ request: { headers: { Authorization: 'Bearer x' } } }) as any;
    expect(out.request.headers.Authorization).toBe(REDACTED);
  });

  it('masks a configured JSON pointer regardless of the value', () => {
    const out = redactValue({ password: 'not-a-known-secret-string' }, {
      sensitivePointers: ['/password'],
    }) as Record<string, string>;
    expect(out.password).toBe(REDACTED);
  });

  it('masks a nested JSON pointer', () => {
    const out = redactValue({ auth: { clientSecret: 'literal' } }, {
      sensitivePointers: ['/auth/clientSecret'],
    }) as any;
    expect(out.auth.clientSecret).toBe(REDACTED);
  });

  it('leaves ordinary values untouched', () => {
    const input = { id: 'c-42', count: 3, active: true, tags: ['a', 'b'] };
    expect(redactValue(input)).toEqual(input);
  });

  it('passes through null and primitives unchanged', () => {
    expect(redactValue(null)).toBeNull();
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
  });

  it('never lets a sentinel secret survive in a realistic execution-trace shape', () => {
    // This is the shape the P0 secret-leakage suite (TIP §86, ADR-0006) checks:
    // a sentinel secret must be absent from config, logs, traces, and errors —
    // however deeply it's nested.
    const sentinel = 'sk-P0-SENTINEL-4f8a';
    const trace = {
      traceId: 't-1',
      resolvedRequest: {
        method: 'GET',
        url: `https://api.example.com/customers?apiKey=${sentinel}`,
        headers: { Authorization: `Bearer ${sentinel}`, Accept: 'application/json' },
      },
      response: { body: { message: `authenticated with ${sentinel}` } },
      errorDetail: `upstream rejected token ${sentinel}`,
    };

    const redacted = redactValue(trace, { secretValues: [sentinel] });

    expect(JSON.stringify(redacted)).not.toContain(sentinel);
  });
});
