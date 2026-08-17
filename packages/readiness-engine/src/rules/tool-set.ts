import type { CanonicalApi, CanonicalOperation } from '@mcpgen/domain';
import { finding, operationLabel } from '../helpers.js';
import type { ReadinessFinding, ReadinessRule } from '../types.js';

const MAX_TOOLS_PER_TAG = 15;
const INTERNAL_PATTERN = /\b(internal|_internal|debug|test|deprecated)\b/i;

export const tooManyToolsPerTag: ReadinessRule = {
  id: 'ARA-TOOL-001',
  category: 'tool-set-quality',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    const byTag = new Map<string, number>();
    for (const op of api.operations) for (const tag of op.tags) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
    const findings: ReadinessFinding[] = [];
    for (const [tag, count] of byTag) {
      if (count > MAX_TOOLS_PER_TAG) {
        findings.push(finding('ARA-TOOL-001', 'tool-set-quality', 'warning', 'Too many tools under one tag', `Tag "${tag}" groups ${count} operations, exceeding ${MAX_TOOLS_PER_TAG}.`, { remediation: 'Split the tag into more specific groups, or curate a smaller tool surface.' }));
      }
    }
    return findings;
  },
};

export const semanticallySimilarOperations: ReadinessRule = {
  id: 'ARA-TOOL-002',
  category: 'tool-set-quality',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    // V1 deterministic heuristic (TIP §16.2 defers embeddings to later): flag
    // same-method operations whose description text is character-identical —
    // a strong signal of copy-paste duplication, not a semantic model.
    const byMethodAndDescription = new Map<string, CanonicalOperation[]>();
    for (const op of api.operations) {
      if (!op.description) continue;
      const key = `${op.method}:${op.description.trim().toLowerCase()}`;
      const list = byMethodAndDescription.get(key) ?? [];
      list.push(op);
      byMethodAndDescription.set(key, list);
    }
    const findings: ReadinessFinding[] = [];
    for (const ops of byMethodAndDescription.values()) {
      if (ops.length > 1) {
        findings.push(finding('ARA-TOOL-002', 'tool-set-quality', 'warning', 'Semantically similar operations', `${ops.map(operationLabel).join(', ')} share identical descriptions — possible duplicates.`, { remediation: 'Confirm these are genuinely distinct operations, or consolidate them.' }));
      }
    }
    return findings;
  },
};

export const deprecatedOperation: ReadinessRule = {
  id: 'ARA-TOOL-003',
  category: 'tool-set-quality',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return api.operations
      .filter((op) => op.deprecated)
      .map((op) => finding('ARA-TOOL-003', 'tool-set-quality', 'high', 'Deprecated operation', `${operationLabel(op)} is marked deprecated.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Exclude from the tool surface unless deliberately retained.', autoFixAvailable: true }));
  },
};

export const internalLookingOperation: ReadinessRule = {
  id: 'ARA-TOOL-004',
  category: 'tool-set-quality',
  severity: 'high',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    return api.operations
      .filter((op) => INTERNAL_PATTERN.test(op.path) || (op.operationId ? INTERNAL_PATTERN.test(op.operationId) : false) || op.tags.some((t) => INTERNAL_PATTERN.test(t)))
      .map((op) => finding('ARA-TOOL-004', 'tool-set-quality', 'high', 'Internal-looking operation', `${operationLabel(op)} looks internal/debug-only based on its path, name, or tags.`, { operationId: operationLabel(op), sourcePointer: op.sourcePointer, remediation: 'Exclude from the agent-facing tool surface unless intentionally exposed.', autoFixAvailable: true }));
  },
};

export const overlappingListAndSearch: ReadinessRule = {
  id: 'ARA-TOOL-005',
  category: 'tool-set-quality',
  severity: 'warning',
  evaluate(api: CanonicalApi): ReadinessFinding[] {
    const getsByBase = new Map<string, CanonicalOperation[]>();
    for (const op of api.operations) {
      if (op.method !== 'GET') continue;
      const base = op.path.replace(/\/search$/i, '').replace(/\/$/, '');
      const list = getsByBase.get(base) ?? [];
      list.push(op);
      getsByBase.set(base, list);
    }
    const findings: ReadinessFinding[] = [];
    for (const [base, ops] of getsByBase) {
      const list = ops.find((o) => o.path === base || o.path === `${base}/`);
      const search = ops.find((o) => /\/search$/i.test(o.path));
      if (list && search) {
        findings.push(finding('ARA-TOOL-005', 'tool-set-quality', 'warning', 'Overlapping list and search operations', `Both ${operationLabel(list)} and ${operationLabel(search)} return results for the same resource.`, { remediation: 'Consider consolidating into one tool with optional filter parameters.' }));
      }
    }
    return findings;
  },
};

export const toolSetRules: ReadinessRule[] = [tooManyToolsPerTag, semanticallySimilarOperations, deprecatedOperation, internalLookingOperation, overlappingListAndSearch];
