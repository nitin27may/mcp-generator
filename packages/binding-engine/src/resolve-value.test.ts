import type { ValueBinding } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { resolveBindingValues, type BindingResolutionContext } from './resolve-value.js';

function ctx(overrides: Partial<BindingResolutionContext> = {}): BindingResolutionContext {
  return {
    toolInput: {},
    getEnv: () => undefined,
    resolveSecret: async () => undefined,
    ...overrides,
  };
}

describe('resolveBindingValues — tool-input', () => {
  it('resolves a present tool-input value, stringified', async () => {
    const bindings: Record<string, ValueBinding> = { customerId: { source: 'tool-input', inputName: 'customer_id' } };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx({ toolInput: { customer_id: 'c-42' } }));
    expect(values).toEqual({ customerId: 'c-42' });
    expect(diagnostics).toEqual([]);
  });

  it('stringifies a numeric tool-input value', async () => {
    const bindings: Record<string, ValueBinding> = { page: { source: 'tool-input', inputName: 'page' } };
    const { values } = await resolveBindingValues(bindings, ctx({ toolInput: { page: 2 } }));
    expect(values.page).toBe('2');
  });

  it('omits (not errors) a tool-input value the agent did not supply', async () => {
    const bindings: Record<string, ValueBinding> = { expand: { source: 'tool-input', inputName: 'expand' } };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx({ toolInput: {} }));
    expect(values).toEqual({});
    expect(diagnostics).toEqual([]);
  });
});

describe('resolveBindingValues — environment', () => {
  it('resolves from the environment when present', async () => {
    const bindings: Record<string, ValueBinding> = { baseUrl: { source: 'environment', name: 'API_URL' } };
    const { values } = await resolveBindingValues(
      bindings,
      ctx({ getEnv: (n) => (n === 'API_URL' ? 'https://api.example.com' : undefined) }),
    );
    expect(values.baseUrl).toBe('https://api.example.com');
  });

  it('falls back to defaultValue when the environment variable is unset', async () => {
    const bindings: Record<string, ValueBinding> = {
      version: { source: 'environment', name: 'API_VERSION', defaultValue: '2026-01' },
    };
    const { values } = await resolveBindingValues(bindings, ctx());
    expect(values.version).toBe('2026-01');
  });

  it('produces BND-005 when required and neither set nor defaulted', async () => {
    const bindings: Record<string, ValueBinding> = { baseUrl: { source: 'environment', name: 'API_URL' } };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx());
    expect(values).toEqual({});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'BND-005' });
  });

  it('omits silently when explicitly required: false', async () => {
    const bindings: Record<string, ValueBinding> = {
      optional: { source: 'environment', name: 'MISSING', required: false },
    };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx());
    expect(values).toEqual({});
    expect(diagnostics).toEqual([]);
  });
});

describe('resolveBindingValues — secret', () => {
  it('resolves via the injected resolver', async () => {
    const bindings: Record<string, ValueBinding> = { apiKey: { source: 'secret', name: 'API_KEY' } };
    const { values } = await resolveBindingValues(
      bindings,
      ctx({ resolveSecret: async (n) => (n === 'API_KEY' ? 'sk-test' : undefined) }),
    );
    expect(values.apiKey).toBe('sk-test');
  });

  it('produces AUT-001 when the secret cannot be resolved', async () => {
    const bindings: Record<string, ValueBinding> = { apiKey: { source: 'secret', name: 'API_KEY' } };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx());
    expect(values).toEqual({});
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'AUT-001' });
  });

  it('never appears anywhere except through the injected resolver — no direct env fallback for secrets', async () => {
    const bindings: Record<string, ValueBinding> = { apiKey: { source: 'secret', name: 'API_KEY' } };
    const { values } = await resolveBindingValues(
      bindings,
      ctx({ getEnv: () => 'should-not-be-used', resolveSecret: async () => undefined }),
    );
    expect(values.apiKey).toBeUndefined();
  });
});

describe('resolveBindingValues — static', () => {
  it('stringifies a static value', async () => {
    const bindings: Record<string, ValueBinding> = { locale: { source: 'static', value: 'en-US' } };
    const { values } = await resolveBindingValues(bindings, ctx());
    expect(values.locale).toBe('en-US');
  });

  it('stringifies a static boolean and number', async () => {
    const bindings: Record<string, ValueBinding> = {
      a: { source: 'static', value: true },
      b: { source: 'static', value: 42 },
    };
    const { values } = await resolveBindingValues(bindings, ctx());
    expect(values).toEqual({ a: 'true', b: '42' });
  });

  it('treats a null static value as intentionally absent, not the string "null"', async () => {
    const bindings: Record<string, ValueBinding> = { x: { source: 'static', value: null } };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx());
    expect(values).toEqual({});
    expect(diagnostics).toEqual([]);
  });
});

describe('resolveBindingValues — aggregation', () => {
  it('resolves every binding and collects diagnostics across all of them, not just the first failure', async () => {
    const bindings: Record<string, ValueBinding> = {
      ok: { source: 'static', value: 'x' },
      missingEnv: { source: 'environment', name: 'MISSING_ENV' },
      missingSecret: { source: 'secret', name: 'MISSING_SECRET' },
    };
    const { values, diagnostics } = await resolveBindingValues(bindings, ctx());
    expect(values).toEqual({ ok: 'x' });
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.code).sort()).toEqual(['AUT-001', 'BND-005']);
  });
});
