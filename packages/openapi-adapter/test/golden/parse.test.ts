import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isStageOk } from '@mcpgen/domain';
import { describe, expect, it } from 'vitest';
import { parseOpenApi } from '../../src/parse.js';

const FIXTURE_PATH = fileURLToPath(
  new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url),
);

function loadFixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('parseOpenApi — customer-oas31 fixture (TIP §69, §82)', () => {
  it('parses the fixture into a canonical model matching the committed golden snapshot', async () => {
    const result = await parseOpenApi(loadFixture(), { sourceId: 'customer-oas31' });

    expect(isStageOk(result)).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchSnapshot();
  });

  it('produces exactly the three P0 operations, each with the expected shape', async () => {
    const result = await parseOpenApi(loadFixture(), { sourceId: 'customer-oas31' });
    const api = result.value!;

    expect(api.operations.map((o) => o.operationId)).toEqual([
      'getCustomer',
      'listCustomers',
      'createCustomer',
    ]);

    const getCustomer = api.operations.find((o) => o.operationId === 'getCustomer')!;
    expect(getCustomer.method).toBe('GET');
    expect(getCustomer.parameters.map((p) => [p.sourceName, p.location, p.required])).toEqual([
      ['customerId', 'path', true],
      ['expand', 'query', false],
    ]);
    expect(getCustomer.security).toEqual([{ schemeName: 'bearerAuth', scopes: [] }]);

    const listCustomers = api.operations.find((o) => o.operationId === 'listCustomers')!;
    expect(listCustomers.parameters.map((p) => p.sourceName)).toEqual(['page', 'pageSize']);

    const createCustomer = api.operations.find((o) => o.operationId === 'createCustomer')!;
    expect(createCustomer.method).toBe('POST');
    expect(createCustomer.requestBody?.required).toBe(true);
    expect(createCustomer.requestBody?.contentType).toBe('application/json');
  });

  it('dereferences $ref schemas inline — no $ref left in the canonical output', async () => {
    // Confirms the research-notes finding (§12): dereference() resolves refs,
    // so openapi-adapter needs no $ref walker of its own for P0.
    const result = await parseOpenApi(loadFixture(), { sourceId: 'customer-oas31' });
    const getCustomer = result.value!.operations.find((o) => o.operationId === 'getCustomer')!;
    const schemaRef = getCustomer.responses[0]?.schema;

    expect(schemaRef?.kind).toBe('inline');
    if (schemaRef?.kind === 'inline') {
      expect(schemaRef.schema.schema).not.toHaveProperty('$ref');
      expect(schemaRef.schema.schema).toMatchObject({
        type: 'object',
        required: ['id', 'name'],
      });
    }
  });

  it('rejects a structurally valid but unsupported OpenAPI version (3.2) with an actionable diagnostic', async () => {
    // Swagger 2.0 and OAS 3.0 are supported (normalized to 3.1 via `upgrade()`,
    // see parse.test.ts) — this exercises the version-dispatch branch with a
    // genuinely unsupported family (TIP §2 row 12: 3.2 is deliberately
    // deferred), not the structural-validation branch covered by the next test.
    const result = await parseOpenApi(
      { openapi: '3.2.0', info: { title: 'x', version: '1' }, paths: {} },
      { sourceId: 'x' },
    );
    expect(isStageOk(result)).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'IMP-001' });
  });

  it('rejects a structurally invalid document with a pointer-bearing diagnostic', async () => {
    const result = await parseOpenApi({ openapi: '3.1.0', info: { title: 'x' } }, { sourceId: 'x' });
    expect(isStageOk(result)).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'IMP-003' });
  });
});
