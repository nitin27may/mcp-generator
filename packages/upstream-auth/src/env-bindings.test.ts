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
      { name: 'API_BASE_URL', sensitive: false, required: true, usedByToolCount: 0, usedByBaseUrl: true, usedByAuth: false },
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
