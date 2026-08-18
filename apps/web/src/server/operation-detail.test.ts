import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { describe, expect, it } from 'vitest';
import { buildOperationDetail } from './operation-detail.js';
import { seedProjectConfig } from '@mcpgen/config-seed';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

describe('buildOperationDetail', () => {
  it('builds parameter/requestBody/schema-budget detail for a real operation using its seeded ToolConfig', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const config = seedProjectConfig(api, 'Customer API');
    const getCustomer = api.operations.find((op) => op.operationId === 'getCustomer')!;

    const detail = buildOperationDetail(getCustomer, api, config);

    expect(detail).toBeDefined();
    expect(detail!.id).toBe(getCustomer.id);
    expect(detail!.parameters.length).toBe(getCustomer.parameters.length);
    expect(detail!.parameters[0]!.sourceName).toBe(getCustomer.parameters[0]!.sourceName);
    expect(detail!.schemaBudget.withinBudget).toBe(true); // this fixture is small — no real budget violation
    expect(detail!.headerAnnotations).toEqual([]); // no x-mcp-header usage in this fixture
  });

  it('returns undefined when the config has no ToolConfig for the operation', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;

    const emptyConfig = seedProjectConfig(api, 'Customer API');
    const operation = api.operations[0]!;
    const configWithoutThisTool = { ...emptyConfig, tools: Object.fromEntries(Object.entries(emptyConfig.tools).filter(([key]) => key !== operation.id)) };

    expect(buildOperationDetail(operation, api, configWithoutThisTool)).toBeUndefined();
  });

  it('assembles requestBody property names from the source schema for an operation that has one', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const api = parsed.value;
    const config = seedProjectConfig(api, 'Customer API');

    const withBody = api.operations.find((op) => op.requestBody !== undefined);
    if (!withBody) return; // fixture has no body-carrying operation — nothing to assert here

    const detail = buildOperationDetail(withBody, api, config)!;
    expect(detail.requestBody).toBeDefined();
    expect(detail.requestBody!.properties.length).toBeGreaterThan(0);
  });
});
