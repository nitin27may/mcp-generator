import type { CanonicalApi } from '@mcpgen/domain';
import type { ReadinessReport } from '@mcpgen/readiness-engine';
import type { RiskAssessment } from '@mcpgen/risk-engine';
import type { OperationSummary } from '@mcpgen/control-contracts';

/** Matches `readiness-engine`'s `operationLabel()` — findings carry that label, not the internal `op.id`. */
function operationLabel(operationId: string | undefined, method: string, path: string): string {
  return operationId ?? `${method} ${path}`;
}

/**
 * `CanonicalApi` + a risk map + an optional readiness report -> the wire
 * `OperationSummary[]` for the tools step (`GET ...?include=operations`).
 * `readiness` is optional because a project that's never visited `/readiness`
 * has no cached analysis yet — finding counts are simply 0 until it has.
 */
export function buildOperationSummaries(api: CanonicalApi, risk: Readonly<Record<string, RiskAssessment>>, readiness?: ReadinessReport): OperationSummary[] {
  return api.operations.map((op): OperationSummary => {
    const label = operationLabel(op.operationId, op.method, op.path);
    const readinessFindingCount = readiness ? readiness.findings.filter((f) => f.operationId === label).length : 0;

    return {
      id: op.id,
      ...(op.operationId !== undefined ? { operationId: op.operationId } : {}),
      method: op.method,
      path: op.path,
      tags: op.tags,
      ...(op.summary !== undefined ? { summary: op.summary } : {}),
      deprecated: op.deprecated,
      parameterCount: op.parameters.length,
      hasRequestBody: op.requestBody !== undefined,
      sourcePointer: op.sourcePointer,
      risk: risk[op.id] ?? { classification: 'UNKNOWN', confidence: 0, reasons: ['No risk classification available'] },
      readinessFindingCount,
    };
  });
}
