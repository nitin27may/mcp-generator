import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import { describe, expect, it } from 'vitest';
import { secretNamesFor } from './secret-bindings.js';

function config(overrides: Partial<McpProjectConfig> = {}): McpProjectConfig {
  return {
    schemaVersion: '1.0',
    project: { name: 'Test' },
    api: { baseUrl: { source: 'environment', name: 'API_BASE_URL' } },
    tools: {},
    generation: { packageName: 'test', binName: 'test', version: '0.1.0', transports: ['stdio'], emitDockerfile: false, mode: 'self-contained' },
    ...overrides,
  };
}

function tool(overrides: Partial<ToolConfig> = {}): ToolConfig {
  return {
    enabled: true,
    sourceOperation: { internalOperationId: 'op', method: 'GET', path: '/x' },
    name: 'tool_x',
    description: 'x',
    bindings: {},
    risk: 'READ_ONLY',
    ...overrides,
  };
}

describe('secretNamesFor', () => {
  it('collects secret-sourced tool bindings', () => {
    const names = secretNamesFor(config(), tool({ bindings: { apiKey: { source: 'secret', name: 'TOOL_SECRET' } } }));
    expect(names).toEqual(['TOOL_SECRET']);
  });

  it('ignores non-secret tool bindings', () => {
    const names = secretNamesFor(
      config(),
      tool({ bindings: { id: { source: 'tool-input', inputName: 'id' }, region: { source: 'static', value: 'us' } } }),
    );
    expect(names).toEqual([]);
  });

  it('includes bearer auth token when secret-sourced', () => {
    const names = secretNamesFor(config({ upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'BEARER_TOKEN' } } }), tool());
    expect(names).toEqual(['BEARER_TOKEN']);
  });

  it('always includes basic auth password (schema-guaranteed secret) even without checking its source', () => {
    const names = secretNamesFor(
      config({ upstreamAuthentication: { type: 'basic', username: { source: 'environment', name: 'USER' }, password: { source: 'secret', name: 'PASS' } } }),
      tool(),
    );
    expect(names).toEqual(['PASS']);
  });

  it('includes both clientSecret and a secret-sourced clientId for OAuth2', () => {
    const names = secretNamesFor(
      config({
        upstreamAuthentication: {
          type: 'oauth2ClientCredentials',
          tokenUrl: 'https://example.com/token',
          clientId: { source: 'secret', name: 'CLIENT_ID_SECRET' },
          clientSecret: { source: 'secret', name: 'CLIENT_SECRET' },
        },
      }),
      tool(),
    );
    expect(names).toEqual(['CLIENT_ID_SECRET', 'CLIENT_SECRET']);
  });

  it('deduplicates and sorts when the same name is used in multiple places', () => {
    const names = secretNamesFor(
      config({ upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'SHARED' } } }),
      tool({ bindings: { x: { source: 'secret', name: 'SHARED' }, y: { source: 'secret', name: 'AAA' } } }),
    );
    expect(names).toEqual(['AAA', 'SHARED']);
  });
});
