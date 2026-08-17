import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation } from '@mcpgen/domain';

export function tool(overrides: Partial<ToolConfig> = {}): ToolConfig {
  return {
    enabled: true,
    sourceOperation: { internalOperationId: 'getCustomer', method: 'GET', path: '/customers/{customerId}' },
    name: 'get_customer',
    description: 'Fetch a customer by id',
    bindings: { customerId: { source: 'tool-input', inputName: 'customer_id' } },
    risk: 'READ_ONLY',
    ...overrides,
  };
}

export function config(overrides: Partial<McpProjectConfig> = {}): McpProjectConfig {
  return {
    schemaVersion: '1.0',
    project: { name: 'customer-mcp' },
    api: { baseUrl: { source: 'environment', name: 'CUSTOMER_API_URL', required: true } },
    upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'CUSTOMER_API_KEY' } },
    tools: { get_customer: tool() },
    generation: {
      packageName: '@acme/customer-mcp',
      binName: 'customer-mcp',
      version: '0.1.0',
      transports: ['stdio'],
      emitDockerfile: true,
      mode: 'self-contained',
    },
    ...overrides,
  };
}

export function operation(overrides: Partial<CanonicalOperation> = {}): CanonicalOperation {
  return {
    id: 'getCustomer',
    sourcePointer: '#/paths/x/get',
    operationId: 'getCustomer',
    method: 'GET',
    path: '/customers/{customerId}',
    tags: [],
    deprecated: false,
    parameters: [{ id: 'path:customerId', sourceName: 'customerId', location: 'path', required: true, schema: { kind: 'inline', schema: { kind: 'json-schema', dialect: '2020-12', schema: { type: 'string' }, sourceDialect: 'json-schema-2020-12', warnings: [] } } }],
    responses: [],
    security: [{ schemeName: 'bearerAuth', scopes: [] }],
    sourceFingerprint: 'fp',
    ...overrides,
  };
}
