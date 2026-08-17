import { describe, expect, it } from 'vitest';
import { EnvironmentSecretProvider } from './secret-resolver.js';

describe('EnvironmentSecretProvider', () => {
  it('resolves a present variable from the injected env', async () => {
    const provider = new EnvironmentSecretProvider({ env: { API_KEY: 'sk-test' } });
    expect(await provider.get('API_KEY')).toBe('sk-test');
  });

  it('returns undefined for a missing variable', async () => {
    const provider = new EnvironmentSecretProvider({ env: {} });
    expect(await provider.get('MISSING')).toBeUndefined();
  });

  it('logs the variable name, never a value, when a secret is missing', async () => {
    const calls: { message: string; data?: unknown }[] = [];
    const provider = new EnvironmentSecretProvider({
      env: {},
      logger: { debug: (message, data) => calls.push({ message, data }), info: () => {}, warn: () => {}, error: () => {} },
    });
    await provider.get('MISSING_KEY');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toEqual({ name: 'MISSING_KEY' });
    expect(JSON.stringify(calls[0])).not.toContain('sk-');
  });

  it('does not log at all on a successful resolution', async () => {
    const calls: unknown[] = [];
    const provider = new EnvironmentSecretProvider({
      env: { API_KEY: 'sk-should-not-be-logged' },
      logger: { debug: (...args) => calls.push(args), info: () => {}, warn: () => {}, error: () => {} },
    });
    await provider.get('API_KEY');
    expect(calls).toHaveLength(0);
  });

  it('defaults to process.env when no env is injected', async () => {
    process.env.MCPGEN_TEST_PROBE = 'probe-value';
    try {
      const provider = new EnvironmentSecretProvider();
      expect(await provider.get('MCPGEN_TEST_PROBE')).toBe('probe-value');
    } finally {
      delete process.env.MCPGEN_TEST_PROBE;
    }
  });
});
