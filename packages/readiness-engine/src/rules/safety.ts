import type { CanonicalApi } from '@mcpgen/domain';
import { finding, operationLabel } from '../helpers.js';
import type { ReadinessRule } from '../types.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BULK_PATTERN = /\b(bulk|batch|mass)\b/i;
const PRIVILEGED_PATTERN = /\b(admin|privileged|permission|role)\b/i;

export const deleteOperation: ReadinessRule = {
  id: 'ARA-SAFE-001',
  category: 'safety',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => op.method === 'DELETE')
      .map((op) => finding('ARA-SAFE-001', 'safety', 'high', 'DELETE operation', `${operationLabel(op)} is a DELETE — irreversible by default.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Never auto-enable; require explicit review before exposing to an agent (BR-006).' }));
  },
};

export const bulkMutationCandidate: ReadinessRule = {
  id: 'ARA-SAFE-002',
  category: 'safety',
  severity: 'critical',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => WRITE_METHODS.has(op.method) && (BULK_PATTERN.test(op.path) || (op.operationId ? BULK_PATTERN.test(op.operationId) : false)))
      .map((op) => finding('ARA-SAFE-002', 'safety', 'critical', 'Bulk mutation candidate', `${operationLabel(op)} looks like a bulk/batch mutation — high blast radius if misused.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Review carefully before exposing; consider requiring confirmation (FR-POL-005).' }));
  },
};

export const privilegedOperation: ReadinessRule = {
  id: 'ARA-SAFE-003',
  category: 'safety',
  severity: 'critical',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => PRIVILEGED_PATTERN.test(op.path) || (op.operationId ? PRIVILEGED_PATTERN.test(op.operationId) : false))
      .map((op) => finding('ARA-SAFE-003', 'safety', 'critical', 'Admin/privileged operation', `${operationLabel(op)} looks like an administrative or privileged endpoint.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Never auto-enable; requires deliberate, reviewed exposure.' }));
  },
};

export const writeOperationNoMeaningfulDescription: ReadinessRule = {
  id: 'ARA-SAFE-004',
  category: 'safety',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => WRITE_METHODS.has(op.method) && !op.description)
      .map((op) => finding('ARA-SAFE-004', 'safety', 'high', 'Write operation with no description', `${operationLabel(op)} performs a ${op.method} with no description of what it does.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'A side-effecting operation must be documented before an agent can use it safely.' }));
  },
};

export const safetyRules: ReadinessRule[] = [deleteOperation, bulkMutationCandidate, privilegedOperation, writeOperationNoMeaningfulDescription];
