import { describe, expect, it } from 'vitest';
import { McpProjectConfigSchema } from './project-config.js';
import { parseProjectConfig } from './parse.js';

const BASE = {
  schemaVersion: '1.0',
  project: { name: 'customer-mcp' },
  api: { baseUrl: { source: 'environment', name: 'CUSTOMER_API_URL', required: true } },
  upstreamAuthentication: { type: 'bearer', token: { source: 'secret', name: 'CUSTOMER_API_KEY' } },
  generation: {
    packageName: '@acme/customer-mcp',
    binName: 'customer-mcp',
    version: '0.1.0',
    transports: ['stdio'],
    emitDockerfile: true,
    mode: 'thin',
  },
} as const;

function tool(overrides: Record<string, unknown> = {}) {
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

describe('McpProjectConfigSchema — the P0 three-tool config', () => {
  it('accepts a realistic P0 config: GET path+query, GET list with pagination, POST with a body', () => {
    const config = {
      ...BASE,
      tools: {
        get_customer: tool(),
        list_customers: tool({
          sourceOperation: { internalOperationId: 'listCustomers', method: 'GET', path: '/customers' },
          name: 'list_customers',
          description: 'List customers',
          bindings: {
            page: { source: 'tool-input', inputName: 'page' },
            pageSize: { source: 'tool-input', inputName: 'page_size' },
          },
        }),
        create_customer: tool({
          sourceOperation: { internalOperationId: 'createCustomer', method: 'POST', path: '/customers' },
          name: 'create_customer',
          description: 'Create a customer',
          bindings: { name: { source: 'tool-input', inputName: 'name' }, email: { source: 'tool-input', inputName: 'email' } },
          risk: 'WRITE',
        }),
      },
    };

    const result = parseProjectConfig(config);
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.tools['get_customer']?.risk).toBe('READ_ONLY');
    expect(result.value?.tools['create_customer']?.risk).toBe('WRITE');
  });

  it('rejects two enabled tools sharing a name — BR-002', () => {
    const config = {
      ...BASE,
      tools: {
        a: tool({ sourceOperation: { internalOperationId: 'a', method: 'GET', path: '/a' } }),
        b: tool({ sourceOperation: { internalOperationId: 'b', method: 'GET', path: '/b' } }), // same name "get_customer"
      },
    };
    const result = parseProjectConfig(config);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.some((d) => d.message.includes('BR-002'))).toBe(true);
  });

  it('allows two DISABLED tools to share a name — a disabled tool is not exposed', () => {
    const config = {
      ...BASE,
      tools: {
        a: tool({ enabled: false, sourceOperation: { internalOperationId: 'a', method: 'GET', path: '/a' } }),
        b: tool({ enabled: false, sourceOperation: { internalOperationId: 'b', method: 'GET', path: '/b' } }),
      },
    };
    expect(parseProjectConfig(config).diagnostics).toEqual([]);
  });

  it('allows a disabled tool to share a name with an enabled one', () => {
    const config = {
      ...BASE,
      tools: {
        a: tool({ sourceOperation: { internalOperationId: 'a', method: 'GET', path: '/a' } }),
        b: tool({ enabled: false, sourceOperation: { internalOperationId: 'b', method: 'GET', path: '/b' } }),
      },
    };
    expect(parseProjectConfig(config).diagnostics).toEqual([]);
  });

  it('rejects an unknown top-level key', () => {
    const result = McpProjectConfigSchema.safeParse({ ...BASE, tools: {}, extraField: true });
    expect(result.success).toBe(false);
  });

  it('rejects a config missing schemaVersion', () => {
    const { schemaVersion: _schemaVersion, ...withoutVersion } = BASE;
    const result = McpProjectConfigSchema.safeParse({ ...withoutVersion, tools: {} });
    expect(result.success).toBe(false);
  });

  it('rejects a tool-input or secret binding for the API base URL', () => {
    // A base URL is deployment-fixed, not something the agent supplies per call.
    const config = { ...BASE, api: { baseUrl: { source: 'tool-input', inputName: 'url' } }, tools: {} };
    expect(McpProjectConfigSchema.safeParse(config).success).toBe(false);
  });

  it('produces a BND-003 diagnostic when a secret binding leaks a literal, end to end', () => {
    const config = {
      ...BASE,
      upstreamAuthentication: {
        type: 'bearer',
        token: { source: 'secret', name: 'CUSTOMER_API_KEY', value: 'sk-leak-through-the-whole-pipeline' },
      },
      tools: {},
    };
    const result = parseProjectConfig(config);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'BND-003' });
  });
});

describe('$schema pointer', () => {
  it('accepts a $schema key so editors can validate the file', () => {
    // Shipping schemas/mcp.config.schema.json is pointless if referencing it is an error.
    expect(
      McpProjectConfigSchema.safeParse({ ...BASE, tools: { get_customer: tool() }, $schema: './schemas/mcp.config.schema.json' }).success,
    ).toBe(true);
  });

  it('still rejects any other unknown top-level key', () => {
    // The allowance is exactly one key wide — .strict() is what stops a leaked literal
    // from being silently dropped (ADR-0006).
    expect(McpProjectConfigSchema.safeParse({ ...BASE, tools: { get_customer: tool() }, schemaUrl: 'x' }).success).toBe(false);
  });
});
