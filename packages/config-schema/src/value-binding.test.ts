import { describe, expect, it } from 'vitest';
import { SecretBindingSchema, StaticBindingSchema, ValueBindingSchema } from './value-binding.js';

describe('SecretBindingSchema — ADR-0006', () => {
  it('accepts a bare reference', () => {
    expect(SecretBindingSchema.safeParse({ source: 'secret', name: 'API_KEY' }).success).toBe(true);
  });

  it('rejects a literal value on the binding — the core ADR-0006 invariant', () => {
    // This is the exact scenario research notes §13 found Zod would silently
    // accept without .strict(): the leak parses away instead of failing.
    const result = SecretBindingSchema.safeParse({ source: 'secret', name: 'API_KEY', value: 'sk-leaked' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: ['value'] });
    }
  });

  it('rejects a non-UPPER_SNAKE_CASE name', () => {
    expect(SecretBindingSchema.safeParse({ source: 'secret', name: 'apiKey' }).success).toBe(false);
  });

  it('accepts an optional provider', () => {
    expect(
      SecretBindingSchema.safeParse({ source: 'secret', name: 'API_KEY', provider: 'vault-reference' }).success,
    ).toBe(true);
  });
});

describe('StaticBindingSchema', () => {
  it('accepts a static value with sensitive omitted', () => {
    expect(StaticBindingSchema.safeParse({ source: 'static', value: 'v1' }).success).toBe(true);
  });

  it('accepts sensitive: false explicitly', () => {
    expect(StaticBindingSchema.safeParse({ source: 'static', value: 'v1', sensitive: false }).success).toBe(true);
  });

  it('rejects sensitive: true — a sensitive static value is a secret binding by another name', () => {
    expect(StaticBindingSchema.safeParse({ source: 'static', value: 'v1', sensitive: true }).success).toBe(false);
  });

  it('accepts null as a static value', () => {
    expect(StaticBindingSchema.safeParse({ source: 'static', value: null }).success).toBe(true);
  });
});

describe('ValueBindingSchema — discriminated union', () => {
  it('discriminates correctly on the "source" field', () => {
    expect(ValueBindingSchema.safeParse({ source: 'tool-input', inputName: 'customer_id' }).success).toBe(true);
    expect(
      ValueBindingSchema.safeParse({ source: 'environment', name: 'BASE_URL', required: true }).success,
    ).toBe(true);
  });

  it('rejects an unknown source discriminator', () => {
    expect(ValueBindingSchema.safeParse({ source: 'mystery', name: 'X' }).success).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(ValueBindingSchema.safeParse({}).success).toBe(false);
  });
});
