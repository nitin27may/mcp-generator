import type { CanonicalApi } from '@mcpgen/domain';
import { finding, operationLabel } from '../helpers.js';
import type { ReadinessRule } from '../types.js';

function isSuccessStatus(statusCode: string): boolean {
  return /^2\d\d$/.test(statusCode);
}

/**
 * TIP §93 C5: FR-ARA-002 names 8 dimensions, but v1.0 shipped rules for only
 * 5 — "response quality" (weight 5) was covered only *indirectly* by
 * ARA-SCHEMA-005 (binary payloads), which is categorized under
 * schema-usability, not response-quality. That left the dimension with zero
 * rules of its own — scoring a vacuous 100 regardless of what the API
 * actually returns. This closes it: a success response with no schema at
 * all means an agent has no idea what shape to expect back.
 */
export const successResponseMissingSchema: ReadinessRule = {
  id: 'ARA-RESP-001',
  category: 'response-quality',
  severity: 'warning',
  evaluate(api: CanonicalApi) {
    const findings = [];
    for (const op of api.operations) {
      const successResponses = op.responses.filter((r) => isSuccessStatus(r.statusCode));
      if (successResponses.length > 0 && successResponses.every((r) => !r.schema)) {
        findings.push(
          finding('ARA-RESP-001', 'response-quality', 'warning', 'Success response has no schema', `${operationLabel(op)} declares a success response with no structured schema — an agent can't predict the response shape.`, {
            operationId: operationLabel(op),
            sourcePointer: op.sourcePointer,
            remediation: 'Add a response schema so tool output can be validated and structured.',
          }),
        );
      }
    }
    return findings;
  },
};

export const responseRules: ReadinessRule[] = [successResponseMissingSchema];
