import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProjectConfig } from '@mcpgen/config-schema';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { describe, expect, it } from 'vitest';
import { seedProjectConfig } from './seed-config.js';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../fixtures/openapi-3.1/customer.json', import.meta.url));

describe('seedProjectConfig', () => {
  it('produces a config that parseProjectConfig accepts, for a real fixture spec', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');

    const config = seedProjectConfig(parsed.value, 'Customer API');
    const result = parseProjectConfig(config);

    expect(result.diagnostics, JSON.stringify(result.diagnostics)).toEqual([]);
    expect(result.value).toBeDefined();
  });

  it('seeds every operation as a disabled tool-input-bound tool, with risk classification applied', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');

    const config = seedProjectConfig(parsed.value, 'Customer API');

    expect(Object.keys(config.tools)).toHaveLength(parsed.value.operations.length);
    for (const tool of Object.values(config.tools)) {
      expect(tool.enabled).toBe(false);
      expect(['READ_ONLY', 'WRITE', 'DESTRUCTIVE', 'PRIVILEGED', 'UNKNOWN']).toContain(tool.risk);
    }

    const getCustomer = Object.values(config.tools).find((t) => t.sourceOperation.operationId === 'getCustomer')!;
    expect(getCustomer.bindings.customerId).toEqual({ source: 'tool-input', inputName: 'customer_id' });
    expect(getCustomer.risk).toBe('READ_ONLY');
  });

  it('seeds a bearer-auth scheme with a secret binding', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');

    const config = seedProjectConfig(parsed.value, 'Customer API');

    expect(config.upstreamAuthentication).toMatchObject({ type: 'bearer', token: { source: 'secret' } });
  });

  it('derives the bearer token env var name without duplicating a slug token the suffix repeats', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');

    // Project name "Customer API" slugifies to "customer-api" — a name ending in the same
    // token ("API") that the apiKey suffix starts with. Regression coverage for the
    // CUSTOMER_API_API_KEY double-token bug.
    const config = seedProjectConfig({ ...parsed.value, securitySchemes: [{ name: 'apiKeyAuth', type: 'apiKey', in: 'header' }] }, 'Customer API');

    expect(config.upstreamAuthentication).toMatchObject({ value: { name: 'CUSTOMER_API_KEY' } });
  });

  it('omits upstreamAuthentication entirely for an OAuth2 scheme rather than seeding an invalid tokenUrl', async () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'X', version: '1' },
      paths: { '/x': { get: { operationId: 'getX', responses: { '200': { description: 'ok' } }, security: [{ oauth: [] }] } } },
      components: { securitySchemes: { oauth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://example.com/token', scopes: {} } } } } },
    };
    const parsed = await parseOpenApi(doc, { sourceId: 'x' });
    if (!parsed.value) throw new Error(`fixture doc failed to parse: ${JSON.stringify(parsed.diagnostics)}`);

    const config = seedProjectConfig(parsed.value, 'OAuth API');

    expect(config.upstreamAuthentication).toBeUndefined();
    const result = parseProjectConfig(config);
    expect(result.diagnostics).toEqual([]);
  });

  it('produces a package/bin name that passes npm-name validation, even for an unusual project name', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');

    const config = seedProjectConfig(parsed.value, '  Some Weird!! Project Name_123  ');

    const result = parseProjectConfig(config);
    expect(result.diagnostics).toEqual([]);
  });
});
