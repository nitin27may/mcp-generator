import type { McpProjectConfig } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { collectConfigEnvBindings } from './env-bindings.js';

function config(overrides: Partial<McpProjectConfig> = {}): McpProjectConfig {
  return {
    schemaVersion: '1.0',
    project: { name: 'Test' },
    api: { baseUrl: { source: 'environment', name: 'API_BASE_URL', required: true } },
    tools: {},
    generation: { packageName: 'test', binName: 'test', version: '0.1.0', transports: ['stdio'], emitDockerfile: false, mode: 'self-contained' },
    ...overrides,
  };
}

describe('collectConfigEnvBindings', () => {
  it('includes the base URL as a required, non-sensitive entry', () => {
    expect(collectConfigEnvBindings(config())).toEqual([
      { name: 'API_BASE_URL', sensitive: false, required: true, usedByToolCount: 0, usedByBaseUrl: true, usedByAuth: false, usedByMcpAccess: false },
    ]);
  });

  it('marks secret bindings sensitive and implicitly required', () => {
    const entries = collectConfigEnvBindings(config({ upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'API_TOKEN' } } }));
    const entry = entries.find((e) => e.name === 'API_TOKEN')!;
    expect(entry.sensitive).toBe(true);
    expect(entry.required).toBe(true);
    expect(entry.usedByAuth).toBe(true);
  });

  it('ignores disabled tools entirely, and counts enabled tools referencing the same name', () => {
    const entries = collectConfigEnvBindings(
      config({
        tools: {
          a: { enabled: true, sourceOperation: { internalOperationId: 'a', method: 'GET', path: '/a' }, name: 'tool_a', description: 'x', bindings: { tenant: { source: 'environment', name: 'TENANT_ID' } }, risk: 'READ_ONLY' },
          b: { enabled: true, sourceOperation: { internalOperationId: 'b', method: 'GET', path: '/b' }, name: 'tool_b', description: 'x', bindings: { tenant: { source: 'environment', name: 'TENANT_ID' } }, risk: 'READ_ONLY' },
          c: { enabled: false, sourceOperation: { internalOperationId: 'c', method: 'GET', path: '/c' }, name: 'tool_c', description: 'x', bindings: { tenant: { source: 'environment', name: 'TENANT_ID' } }, risk: 'READ_ONLY' },
        },
      }),
    );
    const entry = entries.find((e) => e.name === 'TENANT_ID')!;
    expect(entry.usedByToolCount).toBe(2);
  });
});

describe('collectConfigEnvBindings — mcpAccess (Plane A)', () => {
  const base = {
    schemaVersion: '1.0' as const,
    project: { name: 'p' },
    api: { baseUrl: { source: 'environment' as const, name: 'API_URL', required: true } },
    tools: {},
    generation: {
      packageName: '@acme/p',
      binName: 'p',
      version: '0.1.0',
      transports: ['http' as const],
      emitDockerfile: false,
      mode: 'thin' as const,
    },
  };

  it('collects issuer and resource env vars and marks them as Plane A', () => {
    const entries = collectConfigEnvBindings({
      ...base,
      mcpAccess: {
        mode: 'oauth2',
        issuer: { source: 'environment', name: 'MCP_ISSUER_URL', required: true },
        resource: { source: 'environment', name: 'MCP_PUBLIC_URL', required: true },
      },
    } as never);

    const names = entries.map((e) => e.name);
    expect(names).toContain('MCP_ISSUER_URL');
    expect(names).toContain('MCP_PUBLIC_URL');
    const issuer = entries.find((e) => e.name === 'MCP_ISSUER_URL')!;
    expect(issuer.usedByMcpAccess).toBe(true);
    // The two planes must stay distinguishable: they are different credentials with
    // different blast radii, and a reader who conflates them will misjudge both (ADR-0005).
    expect(issuer.usedByAuth).toBe(false);
  });

  it('collects nothing for mode "none"', () => {
    const entries = collectConfigEnvBindings({ ...base, mcpAccess: { mode: 'none' } } as never);
    expect(entries.map((e) => e.name)).toEqual(['API_URL']);
  });

  it('ignores statically-bound issuer and resource — nothing to set in the environment', () => {
    const entries = collectConfigEnvBindings({
      ...base,
      mcpAccess: {
        mode: 'oauth2',
        issuer: { source: 'static', value: 'https://idp.example.com' },
        resource: { source: 'static', value: 'https://mcp.example.com/mcp' },
      },
    } as never);
    expect(entries.map((e) => e.name)).toEqual(['API_URL']);
  });
});
