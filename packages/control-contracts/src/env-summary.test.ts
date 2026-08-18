import type { McpProjectConfig } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { buildEnvVarSummary } from './env-summary.js';

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

describe('buildEnvVarSummary', () => {
  it('includes the base URL as a required, non-sensitive entry', () => {
    const summary = buildEnvVarSummary(config());
    expect(summary).toEqual([{ name: 'API_BASE_URL', sensitive: false, required: true, usedByToolCount: 0, usedByBaseUrl: true, usedByAuth: false }]);
  });

  it('marks secret bindings sensitive and implicitly required, regardless of an auth field explicit required flag', () => {
    const summary = buildEnvVarSummary(
      config({ upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'API_TOKEN' } } }),
    );
    const entry = summary.find((e) => e.name === 'API_TOKEN')!;
    expect(entry.sensitive).toBe(true);
    expect(entry.required).toBe(true);
    expect(entry.usedByAuth).toBe(true);
  });

  it('counts each enabled tool referencing a name, and ignores disabled tools entirely', () => {
    const summary = buildEnvVarSummary(
      config({
        tools: {
          a: {
            enabled: true,
            sourceOperation: { internalOperationId: 'a', method: 'GET', path: '/a' },
            name: 'tool_a',
            description: 'x',
            bindings: { tenant: { source: 'environment', name: 'TENANT_ID' } },
            risk: 'READ_ONLY',
          },
          b: {
            enabled: true,
            sourceOperation: { internalOperationId: 'b', method: 'GET', path: '/b' },
            name: 'tool_b',
            description: 'x',
            bindings: { tenant: { source: 'environment', name: 'TENANT_ID' } },
            risk: 'READ_ONLY',
          },
          c: {
            enabled: false,
            sourceOperation: { internalOperationId: 'c', method: 'GET', path: '/c' },
            name: 'tool_c',
            description: 'x',
            bindings: { tenant: { source: 'environment', name: 'TENANT_ID' } },
            risk: 'READ_ONLY',
          },
        },
      }),
    );
    const entry = summary.find((e) => e.name === 'TENANT_ID')!;
    expect(entry.usedByToolCount).toBe(2); // disabled tool "c" not counted
  });

  it('ignores tool-input and static bindings — only environment/secret produce entries', () => {
    const summary = buildEnvVarSummary(
      config({
        tools: {
          a: {
            enabled: true,
            sourceOperation: { internalOperationId: 'a', method: 'GET', path: '/a' },
            name: 'tool_a',
            description: 'x',
            bindings: {
              id: { source: 'tool-input', inputName: 'id' },
              region: { source: 'static', value: 'us-east-1' },
            },
            risk: 'READ_ONLY',
          },
        },
      }),
    );
    expect(summary.map((e) => e.name)).toEqual(['API_BASE_URL']);
  });

  it('returns entries sorted by name', () => {
    const summary = buildEnvVarSummary(
      config({ upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'AAA_TOKEN' } } }),
    );
    expect(summary.map((e) => e.name)).toEqual(['AAA_TOKEN', 'API_BASE_URL']);
  });
});
