import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { describe, expect, it } from 'vitest';
import { performDryRun } from './playground.js';
import { seedProjectConfig } from './seed-config.js';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

describe('performDryRun', () => {
  it('builds a real request preview for a real fixture operation, substituting tool-input values into the path', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const config = seedProjectConfig(api, 'Customer API');
    const operation = api.operations.find((op) => op.operationId === 'getCustomer')!;
    const toolConfig = config.tools[operation.id]!;

    const result = await performDryRun(config, toolConfig, operation, { customer_id: 'cust_123', expand: 'orders' }, {});

    expect(result.request.method).toBe('GET');
    expect(result.request.path).toBe('/customers/cust_123'); // path placeholder substituted from the tool-input value
    expect(result.request.query).toContainEqual(['expand', 'orders']);
  });

  it('placeholder-substitutes an unresolved environment binding (the base URL) rather than failing, and reports it as unresolved', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const config = seedProjectConfig(api, 'Customer API');
    const operation = api.operations.find((op) => op.operationId === 'getCustomer')!;
    const toolConfig = config.tools[operation.id]!;

    // No env overrides supplied — api.baseUrl is an unresolved `environment` binding in this ephemeral context.
    const result = await performDryRun(config, toolConfig, operation, { customer_id: 'cust_123' }, {});

    expect(result.baseUrl).toBeUndefined();
    expect(result.diagnostics).toEqual([]); // unresolved base URL is not itself a hard error for the tool preview
  });

  it('substitutes a placeholder and lists it as unresolved when a bound environment variable has no override', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const config = seedProjectConfig(api, 'Customer API');
    const operation = api.operations.find((op) => op.operationId === 'getCustomer')!;
    const baseToolConfig = config.tools[operation.id]!;
    // Rebind `customerId` to an environment variable instead of tool-input, to exercise the environment-placeholder path directly.
    const toolConfig = { ...baseToolConfig, bindings: { ...baseToolConfig.bindings, customerId: { source: 'environment' as const, name: 'FIXED_CUSTOMER_ID' } } };

    const result = await performDryRun(config, toolConfig, operation, {}, {});

    expect(result.unresolvedVariables).toContain('FIXED_CUSTOMER_ID');
    expect(result.request.path).toBe('/customers/%3CENV%3AFIXED_CUSTOMER_ID%3E'); // percent-encoded placeholder, still a well-formed path
  });

  it('honors an env override, resolving the base URL when one is supplied', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const config = seedProjectConfig(api, 'Customer API');
    const operation = api.operations.find((op) => op.operationId === 'getCustomer')!;
    const toolConfig = config.tools[operation.id]!;
    const baseUrlEnvName = config.api.baseUrl.source === 'environment' ? config.api.baseUrl.name : undefined;
    if (!baseUrlEnvName) throw new Error('expected the seeded base URL to be an environment binding');

    const result = await performDryRun(config, toolConfig, operation, { customer_id: 'cust_123' }, { [baseUrlEnvName]: 'https://staging.example.com' });

    expect(result.baseUrl).toBe('https://staging.example.com');
    expect(result.unresolvedVariables).not.toContain(baseUrlEnvName);
  });

  it('flags a missing required binding as a hard diagnostic (BND-001), not a placeholder substitution', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const config = seedProjectConfig(api, 'Customer API');
    const operation = api.operations.find((op) => op.operationId === 'getCustomer')!;
    const baseToolConfig = config.tools[operation.id]!;
    const { customerId: _removed, ...bindingsWithoutCustomerId } = baseToolConfig.bindings;
    const toolConfig = { ...baseToolConfig, bindings: bindingsWithoutCustomerId };

    const result = await performDryRun(config, toolConfig, operation, {}, {});

    expect(result.diagnostics.some((d) => d.code === 'BND-001')).toBe(true);
  });
});
