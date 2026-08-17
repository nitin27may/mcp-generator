import type { BindingResolutionContext } from '@mcpgen/binding-engine';
import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { validateStartupRequirements } from './startup.js';

function ctx(overrides: Partial<BindingResolutionContext> = {}): BindingResolutionContext {
  return { toolInput: {}, getEnv: () => undefined, resolveSecret: async () => undefined, ...overrides };
}

function tool(overrides: Partial<ToolConfig> = {}): ToolConfig {
  return {
    enabled: true,
    sourceOperation: { internalOperationId: 'x', method: 'GET', path: '/x' },
    name: 'x',
    description: 'x',
    bindings: {},
    risk: 'READ_ONLY',
    ...overrides,
  };
}

function config(overrides: Partial<McpProjectConfig> = {}): McpProjectConfig {
  return {
    schemaVersion: '1.0',
    project: { name: 'p' },
    api: { baseUrl: { source: 'environment', name: 'BASE_URL' } },
    generation: {
      packageName: '@acme/p',
      binName: 'p',
      version: '0.1.0',
      transports: ['stdio'],
      emitDockerfile: true,
      mode: 'thin',
    },
    tools: {},
    ...overrides,
  };
}

describe('validateStartupRequirements', () => {
  it('resolves the base URL and returns it', async () => {
    const result = await validateStartupRequirements(config(), ctx({ getEnv: (n) => (n === 'BASE_URL' ? 'https://api.example.com' : undefined) }));
    expect(result.baseUrl).toBe('https://api.example.com');
    expect(result.diagnostics).toEqual([]);
  });

  it('fails fast when the base URL cannot be resolved', async () => {
    const result = await validateStartupRequirements(config(), ctx());
    expect(result.baseUrl).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({ code: 'BND-005' });
  });

  it('checks upstream auth secrets at startup', async () => {
    const c = {
      ...config(),
      upstreamAuthentication: { type: 'bearer' as const, token: { source: 'secret' as const, name: 'API_KEY' } },
    };
    const result = await validateStartupRequirements(c, ctx({ getEnv: () => 'x' }));
    expect(result.diagnostics.some((d) => d.code === 'AUT-001')).toBe(true);
  });

  it('checks required env/secret bindings on every enabled tool', async () => {
    const c = config({
      tools: { get_x: tool({ bindings: { apiVersion: { source: 'environment', name: 'API_VERSION' } } }) },
    });
    const result = await validateStartupRequirements(c, ctx({ getEnv: (n) => (n === 'BASE_URL' ? 'x' : undefined) }));
    expect(result.diagnostics.some((d) => d.code === 'BND-005' && d.message.includes('tool "get_x"'))).toBe(true);
  });

  it('skips a disabled tool\'s bindings entirely', async () => {
    const c = config({
      tools: { get_x: tool({ enabled: false, bindings: { v: { source: 'environment', name: 'MISSING' } } }) },
    });
    const result = await validateStartupRequirements(c, ctx({ getEnv: (n) => (n === 'BASE_URL' ? 'x' : undefined) }));
    expect(result.diagnostics).toEqual([]);
  });

  it('never checks tool-input bindings — there is no call in progress at startup', async () => {
    const c = config({
      tools: { get_x: tool({ bindings: { customerId: { source: 'tool-input', inputName: 'customer_id' } } }) },
    });
    const result = await validateStartupRequirements(c, ctx({ getEnv: (n) => (n === 'BASE_URL' ? 'x' : undefined) }));
    expect(result.diagnostics).toEqual([]);
  });

  it('reports every unresolved binding across the whole config, not just the first', async () => {
    const c = config({
      tools: {
        a: tool({ bindings: { x: { source: 'environment', name: 'MISSING_A' } } }),
        b: tool({ bindings: { y: { source: 'secret', name: 'MISSING_B' } } }),
      },
    });
    const result = await validateStartupRequirements(c, ctx());
    const codes = result.diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual(['AUT-001', 'BND-005', 'BND-005']); // base URL + tool a + tool b
  });
});
