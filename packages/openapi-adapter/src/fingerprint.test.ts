import { describe, expect, it } from 'vitest';
import { fingerprintOf } from './fingerprint.js';

describe('fingerprintOf', () => {
  it('is stable regardless of key order', () => {
    const a = fingerprintOf({ method: 'GET', path: '/x' });
    const b = fingerprintOf({ path: '/x', method: 'GET' });
    expect(a).toBe(b);
  });

  it('is stable across nested key order', () => {
    const a = fingerprintOf({ op: { b: 1, a: 2 }, tags: ['x'] });
    const b = fingerprintOf({ tags: ['x'], op: { a: 2, b: 1 } });
    expect(a).toBe(b);
  });

  it('differs when content differs', () => {
    expect(fingerprintOf({ path: '/x' })).not.toBe(fingerprintOf({ path: '/y' }));
  });

  it('is a 64-character hex sha256 digest', () => {
    expect(fingerprintOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('distinguishes array order (order is semantic, unlike object keys)', () => {
    expect(fingerprintOf(['a', 'b'])).not.toBe(fingerprintOf(['b', 'a']));
  });
});
