import { describe, expect, it } from 'vitest';
import { computeBackoffMs, DEFAULT_RETRY_POLICY, isRetryEligible, isTransientFailure, parseRetryAfterMs } from './retry-policy.js';

describe('isRetryEligible', () => {
  it('defaults GET and HEAD to retryable', () => {
    expect(isRetryEligible('GET', 'READ_ONLY', undefined)).toBe(true);
    expect(isRetryEligible('HEAD', 'READ_ONLY', undefined)).toBe(true);
  });

  it('defaults PUT/POST/DELETE/PATCH to not retryable', () => {
    for (const method of ['PUT', 'POST', 'DELETE', 'PATCH']) {
      expect(isRetryEligible(method, 'WRITE', undefined)).toBe(false);
    }
  });

  it('lets an explicit config.enabled override the method default in either direction', () => {
    expect(isRetryEligible('PUT', 'WRITE', { enabled: true })).toBe(true);
    expect(isRetryEligible('GET', 'READ_ONLY', { enabled: false })).toBe(false);
  });

  it('DESTRUCTIVE risk is a hard floor — no override can re-enable retry (BR-006)', () => {
    expect(isRetryEligible('GET', 'DESTRUCTIVE', { enabled: true })).toBe(false);
    expect(isRetryEligible('DELETE', 'DESTRUCTIVE', undefined)).toBe(false);
  });

  it('PRIVILEGED risk is also a hard floor', () => {
    expect(isRetryEligible('GET', 'PRIVILEGED', { enabled: true })).toBe(false);
  });
});

describe('isTransientFailure', () => {
  it('treats a network error as always transient', () => {
    expect(isTransientFailure(undefined, true)).toBe(true);
  });

  it('treats 408/429/502/503/504 as transient', () => {
    for (const status of [408, 429, 502, 503, 504]) expect(isTransientFailure(status, false)).toBe(true);
  });

  it('treats other statuses, including other 4xx/5xx, as not transient', () => {
    for (const status of [200, 400, 401, 403, 404, 409, 422, 500, 501]) expect(isTransientFailure(status, false)).toBe(false);
  });
});

describe('parseRetryAfterMs', () => {
  const now = 1_700_000_000_000;

  it('parses a numeric seconds value', () => {
    expect(parseRetryAfterMs('120', now)).toBe(120_000);
  });

  it('parses an HTTP-date value relative to `now`', () => {
    const future = new Date(now + 5_000).toUTCString();
    expect(parseRetryAfterMs(future, now)).toBeCloseTo(5_000, -2);
  });

  it('returns undefined for null or unparsable values', () => {
    expect(parseRetryAfterMs(null, now)).toBeUndefined();
    expect(parseRetryAfterMs('not-a-date', now)).toBeUndefined();
  });

  it('clamps a past HTTP-date to 0 rather than a negative delay', () => {
    const past = new Date(now - 5_000).toUTCString();
    expect(parseRetryAfterMs(past, now)).toBe(0);
  });
});

describe('computeBackoffMs', () => {
  it('caps the Retry-After value at maxDelayMs', () => {
    expect(computeBackoffMs(1, DEFAULT_RETRY_POLICY, 999_999)).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
  });

  it('uses Retry-After directly when under the cap', () => {
    expect(computeBackoffMs(1, DEFAULT_RETRY_POLICY, 1_000)).toBe(1_000);
  });

  it('produces a jittered delay within [0, cappedExponentialDelay] when no Retry-After is given', () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = computeBackoffMs(attempt, DEFAULT_RETRY_POLICY, undefined);
      const capped = Math.min(DEFAULT_RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1), DEFAULT_RETRY_POLICY.maxDelayMs);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(capped);
    }
  });
});
