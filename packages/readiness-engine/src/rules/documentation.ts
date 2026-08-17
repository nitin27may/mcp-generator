import type { CanonicalApi } from '@mcpgen/domain';
import { finding, operationLabel } from '../helpers.js';
import type { ReadinessRule } from '../types.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const GENERIC_DESCRIPTIONS = new Set(['gets data', 'get data', 'retrieves data', 'does something', 'performs an action']);
const MIN_DESCRIPTION_LENGTH = 10;
const SIDE_EFFECT_WORDS = /\b(create|creates|update|updates|delete|deletes|remove|removes|modify|modifies|add|adds|insert|inserts|replace|replaces|cancel|cancels)\b/i;

export const missingSummary: ReadinessRule = {
  id: 'ARA-DOC-001',
  category: 'semantic-clarity',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => !op.summary)
      .map((op) => finding('ARA-DOC-001', 'semantic-clarity', 'high', 'Missing summary', `${operationLabel(op)} has no summary.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Add a one-line summary describing what the operation does.' }));
  },
};

export const missingDescription: ReadinessRule = {
  id: 'ARA-DOC-002',
  category: 'semantic-clarity',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => !op.description)
      .map((op) => finding('ARA-DOC-002', 'semantic-clarity', 'high', 'Missing description', `${operationLabel(op)} has no description.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Add a description covering what the operation does, when to use it, and any constraints.' }));
  },
};

export const missingParameterDescription: ReadinessRule = {
  id: 'ARA-DOC-003',
  category: 'semantic-clarity',
  severity: 'warning',
  evaluate(api: CanonicalApi) {
    const findings = [];
    for (const op of api.operations) {
      for (const param of op.parameters) {
        if (!param.description) {
          findings.push(
            finding('ARA-DOC-003', 'semantic-clarity', 'warning', 'Missing parameter description', `Parameter "${param.sourceName}" on ${operationLabel(op)} has no description.`, {
              operationId: operationLabel(op),
              sourcePointer: op.sourcePointer,
              remediation: `Describe what "${param.sourceName}" means and any constraints on its value.`,
            }),
          );
        }
      }
    }
    return findings;
  },
};

export const parameterDescriptionRepeatsName: ReadinessRule = {
  id: 'ARA-DOC-004',
  category: 'semantic-clarity',
  severity: 'warning',
  evaluate(api: CanonicalApi) {
    const findings = [];
    for (const op of api.operations) {
      for (const param of op.parameters) {
        if (param.description && normalize(param.description) === normalize(param.sourceName)) {
          findings.push(
            finding('ARA-DOC-004', 'semantic-clarity', 'warning', 'Parameter description repeats its name', `The description of "${param.sourceName}" on ${operationLabel(op)} is just the parameter name restated.`, {
              operationId: operationLabel(op),
              sourcePointer: op.sourcePointer,
              remediation: 'Describe the meaning and constraints of the value, not just its name.',
            }),
          );
        }
      }
    }
    return findings;
  },
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export const genericOrShortDescription: ReadinessRule = {
  id: 'ARA-DOC-005',
  category: 'semantic-clarity',
  severity: 'warning',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => op.description && (op.description.trim().length < MIN_DESCRIPTION_LENGTH || GENERIC_DESCRIPTIONS.has(op.description.trim().toLowerCase())))
      .map((op) => finding('ARA-DOC-005', 'semantic-clarity', 'warning', 'Generic or too-short description', `The description of ${operationLabel(op)} ("${op.description}") is too generic to guide an agent.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Write a description specific to this operation: what it does, when to use it, side effects.' }));
  },
};

export const writeOperationMissingSideEffect: ReadinessRule = {
  id: 'ARA-DOC-006',
  category: 'semantic-clarity',
  severity: 'high',
  evaluate(api: CanonicalApi) {
    return api.operations
      .filter((op) => WRITE_METHODS.has(op.method) && op.description !== undefined && !SIDE_EFFECT_WORDS.test(op.description))
      .map((op) => finding('ARA-DOC-006', 'semantic-clarity', 'high', 'Write operation with no stated side effect', `${operationLabel(op)} is a ${op.method} but its description doesn't state what it creates, updates, or removes.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'State the side effect explicitly, e.g. "Creates a new customer record."' }));
  },
};

export const undocumentedEnum: ReadinessRule = {
  id: 'ARA-DOC-007',
  category: 'semantic-clarity',
  severity: 'info',
  evaluate(api: CanonicalApi) {
    const findings = [];
    for (const op of api.operations) {
      for (const param of op.parameters) {
        const schema = param.schema.kind === 'inline' ? param.schema.schema.schema : undefined;
        const hasEnum = Array.isArray(schema?.enum);
        if (hasEnum && !param.description) {
          findings.push(
            finding('ARA-DOC-007', 'semantic-clarity', 'info', 'Enum values undocumented', `Parameter "${param.sourceName}" on ${operationLabel(op)} has enum values but no description explaining them.`, {
              operationId: operationLabel(op),
              sourcePointer: op.sourcePointer,
              remediation: 'Explain what each enum value means.',
            }),
          );
        }
      }
    }
    return findings;
  },
};

export const documentationRules: ReadinessRule[] = [
  missingSummary,
  missingDescription,
  missingParameterDescription,
  parameterDescriptionRepeatsName,
  genericOrShortDescription,
  writeOperationMissingSideEffect,
  undocumentedEnum,
];
