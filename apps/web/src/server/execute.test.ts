import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { startFixtureApi, type FixtureApiHandle } from '@mcpgen/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { performExecute } from './execute.js';
import { seedProjectConfig } from './seed-config.js';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));
const BEARER_TOKEN = 'sk-e2e-sentinel-secret';

let api: FixtureApiHandle | undefined;

afterEach(async () => {
  await api?.stop();
  api = undefined;
});

describe('performExecute', () => {
  it('executes a real tool call against a real local fixture API and returns a redacted trace', async () => {
    api = await startFixtureApi({ expectedToken: BEARER_TOKEN });

    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const canonicalApi = parsed.value;
    const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

    const baseConfig = seedProjectConfig(canonicalApi, 'Customer API');
    const operation = canonicalApi.operations.find((op) => op.operationId === 'getCustomer')!;
    const bearerToken = baseConfig.upstreamAuthentication?.type === 'bearer' ? baseConfig.upstreamAuthentication.token : undefined;
    const tokenBindingName = bearerToken?.source === 'secret' ? bearerToken.name : undefined;
    if (!tokenBindingName) throw new Error('expected the seeded auth to be bearer');

    const config = {
      ...baseConfig,
      api: { baseUrl: { source: 'static' as const, value: api.baseUrl } },
      tools: { ...baseConfig.tools, [operation.id]: { ...baseConfig.tools[operation.id]!, enabled: true } },
    };

    const outcome = await performExecute(
      config,
      operationsById,
      config.tools[operation.id]!.name,
      { customer_id: 'c-42', expand: 'orders' },
      {},
      { [tokenBindingName]: BEARER_TOKEN },
      false,
      true, // the fixture API is loopback — allowPrivateEgress must be true to reach it, matching real local-dev usage
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.trace.resultType).toBe('success');
    expect(outcome.trace.upstreamStatus).toBe(200);
    expect(outcome.trace.response).toMatchObject({ id: 'c-42', name: 'Ada Lovelace' });

    // The real request actually reached the fixture API with the exact expected shape.
    const request = api.requests.at(-1)!;
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/customers/c-42?expand=orders');
    expect(request.headers.authorization).toBe(`Bearer ${BEARER_TOKEN}`);

    // The secret literal never appears anywhere in the trace that leaves the process.
    const serializedTrace = JSON.stringify(outcome.trace);
    expect(serializedTrace).not.toContain(BEARER_TOKEN);
    expect(outcome.trace.resolvedRequest?.headers['authorization']).toBe('[REDACTED]');
  });

  it('refuses to execute a DESTRUCTIVE tool without acknowledgeRisk', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const canonicalApi = parsed.value;
    const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

    const baseConfig = seedProjectConfig(canonicalApi, 'Customer API');
    const operation = canonicalApi.operations.find((op) => op.operationId === 'createCustomer')!;
    const config = {
      ...baseConfig,
      tools: { ...baseConfig.tools, [operation.id]: { ...baseConfig.tools[operation.id]!, enabled: true, risk: 'DESTRUCTIVE' as const } },
    };

    const outcome = await performExecute(config, operationsById, config.tools[operation.id]!.name, {}, {}, {}, false, false);
    expect(outcome).toEqual({ ok: false, kind: 'risk-not-acknowledged' });
  });

  it('reports base-url-unresolved when the base URL binding has no value and no override is supplied', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const canonicalApi = parsed.value;
    const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

    const baseConfig = seedProjectConfig(canonicalApi, 'Customer API'); // seeded baseUrl is an environment binding with no default
    const operation = canonicalApi.operations.find((op) => op.operationId === 'getCustomer')!;
    const config = { ...baseConfig, tools: { ...baseConfig.tools, [operation.id]: { ...baseConfig.tools[operation.id]!, enabled: true } } };

    const outcome = await performExecute(config, operationsById, config.tools[operation.id]!.name, { customer_id: 'x' }, {}, {}, false, false);
    expect(outcome).toMatchObject({ ok: false, kind: 'base-url-unresolved' });
  });
});
