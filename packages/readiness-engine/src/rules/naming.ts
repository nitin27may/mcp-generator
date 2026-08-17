import type { CanonicalApi } from '@mcpgen/domain';
import { finding, operationLabel } from '../helpers.js';
import type { ReadinessFinding, ReadinessRule } from '../types.js';

const GENERIC_NAMES = new Set(['get', 'post', 'put', 'delete', 'patch', 'do', 'process', 'handle', 'execute', 'run', 'action']);
const MAX_SAFE_TOOL_NAME_LENGTH = 128;

function normalizedName(operationId: string): string {
  return operationId
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const missingOperationId: ReadinessRule = {
  id: 'ARA-NAME-001',
  category: 'discoverability',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return api.operations
      .filter((op) => !op.operationId)
      .map((op) =>
        finding('ARA-NAME-001', 'discoverability', 'high', 'Missing operationId', `${op.method} ${op.path} has no operationId, so its tool name falls back to a method+path derivation instead of a meaningful name.`, {
          operationId: operationLabel(op),
          sourcePointer: op.sourcePointer,
          remediation: 'Add an operationId to the OpenAPI document, or assign a tool name explicitly.',
        }),
      );
  },
};

export const duplicateOperationId: ReadinessRule = {
  id: 'ARA-NAME-002',
  category: 'discoverability',
  severity: 'critical',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    const seen = new Map<string, number>();
    for (const op of api.operations) if (op.operationId) seen.set(op.operationId, (seen.get(op.operationId) ?? 0) + 1);
    const findings: ReadinessFinding[] = [];
    for (const op of api.operations) {
      if (op.operationId && (seen.get(op.operationId) ?? 0) > 1) {
        findings.push(
          finding('ARA-NAME-002', 'discoverability', 'critical', 'Duplicate operationId', `operationId "${op.operationId}" is used by more than one operation.`, {
            operationId: operationLabel(op),
            sourcePointer: op.sourcePointer,
            remediation: 'Make every operationId unique across the document.',
          }),
        );
      }
    }
    return findings;
  },
};

export const normalizedNameCollision: ReadinessRule = {
  id: 'ARA-NAME-003',
  category: 'discoverability',
  severity: 'critical',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    const byNormalized = new Map<string, string[]>();
    for (const op of api.operations) {
      const key = normalizedName(op.operationId ?? `${op.method}_${op.path}`);
      const list = byNormalized.get(key) ?? [];
      list.push(operationLabel(op));
      byNormalized.set(key, list);
    }
    const findings: ReadinessFinding[] = [];
    for (const [normalized, labels] of byNormalized) {
      if (labels.length > 1) {
        findings.push(
          finding('ARA-NAME-003', 'discoverability', 'critical', 'Normalized MCP name collision', `${labels.join(', ')} all normalize to the tool name "${normalized}".`, {
            remediation: 'Rename one or more operations, or override the generated tool name explicitly.',
          }),
        );
      }
    }
    return findings;
  },
};

export const genericName: ReadinessRule = {
  id: 'ARA-NAME-004',
  category: 'discoverability',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return api.operations
      .filter((op) => op.operationId && GENERIC_NAMES.has(op.operationId.toLowerCase()))
      .map((op) =>
        finding('ARA-NAME-004', 'discoverability', 'warning', 'Generic operation name', `operationId "${op.operationId}" is a bare generic verb and doesn't communicate what the tool does.`, {
          operationId: operationLabel(op),
          sourcePointer: op.sourcePointer,
          remediation: 'Rename to verb+resource, e.g. "get_customer" rather than "get".',
          autoFixAvailable: true,
        }),
      );
  },
};

export const nameTooLong: ReadinessRule = {
  id: 'ARA-NAME-005',
  category: 'discoverability',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return api.operations
      .filter((op) => normalizedName(op.operationId ?? `${op.method}_${op.path}`).length > MAX_SAFE_TOOL_NAME_LENGTH)
      .map((op) =>
        finding('ARA-NAME-005', 'discoverability', 'warning', 'Tool name exceeds safe length', `The normalized tool name for ${operationLabel(op)} exceeds ${MAX_SAFE_TOOL_NAME_LENGTH} characters.`, {
          operationId: operationLabel(op),
          sourcePointer: op.sourcePointer,
          remediation: 'Shorten the operationId or override the generated tool name.',
        }),
      );
  },
};

export const namingRules: ReadinessRule[] = [missingOperationId, duplicateOperationId, normalizedNameCollision, genericName, nameTooLong];
