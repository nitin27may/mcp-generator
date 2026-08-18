import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CanonicalApi, CanonicalOperation } from '@mcpgen/domain';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { analyzeReadiness } from '@mcpgen/readiness-engine';
import { classifyApi } from '@mcpgen/risk-engine';
import { describe, expect, it } from 'vitest';
import { buildOperationSummaries } from './operations.js';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

describe('buildOperationSummaries', () => {
  it('produces one summary per operation, with real risk classification, for a real fixture spec', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');

    const summaries = buildOperationSummaries(parsed.value, classifyApi(parsed.value));

    expect(summaries).toHaveLength(parsed.value.operations.length);
    for (const summary of summaries) {
      expect(['READ_ONLY', 'WRITE', 'DESTRUCTIVE', 'PRIVILEGED', 'UNKNOWN']).toContain(summary.risk.classification);
      expect(summary.readinessFindingCount).toBe(0); // no readiness report passed
    }

    const getCustomer = summaries.find((s) => s.operationId === 'getCustomer')!;
    expect(getCustomer.method).toBe('GET');
    expect(getCustomer.risk.classification).toBe('READ_ONLY');
    expect(getCustomer.parameterCount).toBeGreaterThan(0);
  });

  it('counts readiness findings against the operation label (operationId, falling back to METHOD path), not the internal operation id', () => {
    // Deliberately missing summary/description — real findings (ARA-DOC-001/002), not the clean
    // fixture's zero-finding case, so this test actually exercises the label-matching logic.
    const withOperationId: CanonicalOperation = {
      id: 'internal-1',
      sourcePointer: '#/paths/~1widgets/get',
      operationId: 'listWidgets',
      method: 'GET',
      path: '/widgets',
      tags: [],
      deprecated: false,
      parameters: [],
      responses: [],
      security: [],
      sourceFingerprint: 'fp',
    };
    const withoutOperationId: CanonicalOperation = {
      id: 'internal-2',
      sourcePointer: '#/paths/~1gadgets/get',
      method: 'GET',
      path: '/gadgets',
      tags: [],
      deprecated: false,
      parameters: [],
      responses: [],
      security: [],
      sourceFingerprint: 'fp',
    };
    const canonicalApi: CanonicalApi = {
      schemaVersion: '1.0',
      source: { id: 'test', rawFingerprint: 'fp' },
      info: { title: 'Test API', version: '1.0.0' },
      servers: [],
      securitySchemes: [],
      operations: [withOperationId, withoutOperationId],
      schemas: {},
      diagnostics: [],
    };

    const readiness = analyzeReadiness(canonicalApi);
    expect(readiness.findings.length).toBeGreaterThan(0); // sanity: this fixture must actually produce findings

    const summaries = buildOperationSummaries(canonicalApi, classifyApi(canonicalApi), readiness);
    const byInternalId = new Map(summaries.map((s) => [s.id, s]));

    expect(byInternalId.get('internal-1')!.readinessFindingCount).toBeGreaterThan(0); // matched via operationId label
    expect(byInternalId.get('internal-2')!.readinessFindingCount).toBeGreaterThan(0); // matched via "GET /gadgets" fallback label

    const totalCounted = summaries.reduce((sum, s) => sum + s.readinessFindingCount, 0);
    const operationScopedFindingCount = readiness.findings.filter((f) => f.operationId !== undefined).length;
    expect(totalCounted).toBe(operationScopedFindingCount); // every operation-scoped finding lands on exactly one summary
  });
});
