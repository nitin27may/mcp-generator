import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation } from '@mcpgen/domain';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import { buildToolRegistry, type RuntimeDeps } from './tool-registry.js';

const FIXTURE_PATH = fileURLToPath(
  new URL('../../../fixtures/openapi-3.1/customer.json', import.meta.url),
);

async function loadOperations(): Promise<Record<string, CanonicalOperation>> {
  const doc = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const result = await parseOpenApi(doc, { sourceId: 'customer-oas31' });
  const operations: Record<string, CanonicalOperation> = {};
  for (const op of result.value!.operations) operations[op.id] = op;
  return operations;
}

let server: Server | undefined;

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

function deps(baseUrl: string, overrides: Partial<RuntimeDeps> = {}): RuntimeDeps {
  return { baseUrl, getEnv: () => undefined, resolveSecret: async () => undefined, ...overrides };
}

function getCustomerTool(): ToolConfig {
  return {
    enabled: true,
    sourceOperation: { internalOperationId: 'getCustomer', method: 'GET', path: '/customers/{customerId}' },
    name: 'get_customer',
    description: 'Fetch a customer by id',
    bindings: {
      customerId: { source: 'tool-input', inputName: 'customer_id' },
      expand: { source: 'tool-input', inputName: 'expand' },
    },
    risk: 'READ_ONLY',
  };
}

function baseConfig(tools: Record<string, ToolConfig>): McpProjectConfig {
  return {
    schemaVersion: '1.0',
    project: { name: 'customer-mcp' },
    api: { baseUrl: { source: 'static', value: 'http://placeholder' } },
    generation: {
      packageName: '@acme/customer-mcp',
      binName: 'customer-mcp',
      version: '0.1.0',
      transports: ['stdio'],
      emitDockerfile: true,
      mode: 'thin',
    },
    tools,
  };
}

describe('buildToolRegistry — the P0 fixture end to end', () => {
  it('builds a ProtocolTool whose input schema matches the operation, and whose execute() hits the real upstream API', async () => {
    const operations = await loadOperations();
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/customers/c-42?expand=orders');
      expect(req.headers.authorization).toBe('Bearer sk-live');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'c-42', name: 'Ada' }));
    });

    const config = {
      ...baseConfig({ get_customer: getCustomerTool() }),
      upstreamAuthentication: { type: 'bearer' as const, token: { source: 'secret' as const, name: 'API_KEY' } },
    };

    const { tools, diagnostics } = buildToolRegistry(config, operations, deps(baseUrl, {
      resolveSecret: async (name) => (name === 'API_KEY' ? 'sk-live' : undefined),
    }));

    expect(diagnostics).toEqual([]);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('get_customer');
    // Property names are the tool-input binding's inputName ("customer_id"),
    // not the upstream parameter's sourceName ("customerId") — FR-BIND-004.
    expect(tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      properties: { customer_id: { type: 'string' }, expand: { type: 'string', enum: ['orders', 'invoices'] } },
      required: ['customer_id'],
    });

    const result = await tools[0]!.execute({ customer_id: 'c-42', expand: 'orders' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ id: 'c-42', name: 'Ada' });
  });

  it('skips a disabled tool entirely', async () => {
    const operations = await loadOperations();
    const config = baseConfig({ get_customer: { ...getCustomerTool(), enabled: false } });
    const { tools, diagnostics } = buildToolRegistry(config, operations, deps('http://localhost:1'));
    expect(tools).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('produces a GEN-004 diagnostic when a tool references an operation that does not exist — BR-001', async () => {
    const operations = await loadOperations();
    const config = baseConfig({
      broken: { ...getCustomerTool(), sourceOperation: { internalOperationId: 'noSuchOperation', method: 'GET', path: '/x' } },
    });
    const { tools, diagnostics } = buildToolRegistry(config, operations, deps('http://localhost:1'));
    expect(tools).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'GEN-004' });
  });

  it('builds a POST tool whose input schema includes body fields', async () => {
    const operations = await loadOperations();
    const config = baseConfig({
      create_customer: {
        enabled: true,
        sourceOperation: { internalOperationId: 'createCustomer', method: 'POST', path: '/customers' },
        name: 'create_customer',
        description: 'Create a customer',
        bindings: {
          name: { source: 'tool-input', inputName: 'name' },
          email: { source: 'tool-input', inputName: 'email' },
        },
        risk: 'WRITE',
      },
    });
    const { tools } = buildToolRegistry(config, operations, deps('http://localhost:1'));
    expect(tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' }, email: { type: 'string' } },
      required: ['name', 'email'],
    });
  });

  it('redacts a secret that the upstream API echoes back in its response body', async () => {
    const operations = await loadOperations();
    const baseUrl = await startServer((_req, res) => {
      // A misbehaving-but-realistic API that echoes the auth header back in an error body.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'c-42', debug: 'authenticated with Bearer sk-live-sentinel' }));
    });

    const config = {
      ...baseConfig({ get_customer: getCustomerTool() }),
      upstreamAuthentication: { type: 'bearer' as const, token: { source: 'secret' as const, name: 'API_KEY' } },
    };
    const { tools } = buildToolRegistry(config, operations, deps(baseUrl, {
      resolveSecret: async () => 'sk-live-sentinel',
    }));

    const result = await tools[0]!.execute({ customer_id: 'c-42' });
    expect(JSON.stringify(result)).not.toContain('sk-live-sentinel');
  });

  it('returns isError: true for a 4xx/5xx upstream response, without throwing', async () => {
    const operations = await loadOperations();
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    const { tools } = buildToolRegistry(baseConfig({ get_customer: getCustomerTool() }), operations, deps(baseUrl));
    const result = await tools[0]!.execute({ customer_id: 'c-1' });
    expect(result.isError).toBe(true);
  });

  it('surfaces a binding resolution failure as isError without throwing', async () => {
    const operations = await loadOperations();
    const config = {
      ...baseConfig({ get_customer: getCustomerTool() }),
      upstreamAuthentication: { type: 'bearer' as const, token: { source: 'secret' as const, name: 'MISSING_KEY' } },
    };
    const { tools } = buildToolRegistry(config, operations, deps('http://localhost:1'));
    const result = await tools[0]!.execute({ customer_id: 'c-1' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('AUT-001');
  });
});
