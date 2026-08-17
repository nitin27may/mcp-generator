import type { CanonicalApi, CanonicalOperation } from '@mcpgen/domain';
import type { RiskAssessment } from './types.js';

const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);
const PRIVILEGED_PATTERN = /\b(admin|privileged|permission|role)s?\b/i;
const DESTRUCTIVE_ACTION_PATTERN = /\b(delete|purge|cancel|terminate|remove|destroy)s?\b/i;
const BULK_PATTERN = /\b(bulk|batch|mass)\b/i;
const READ_LIKE_PATH_PATTERN = /\b(search|query|filter|lookup|find)\b/i;

/**
 * TIP §15.1. Deterministic and rule-ordered — first decisive match wins, not
 * a weighted vote — so the same operation always classifies the same way
 * and the reasoning is inspectable. "User override always wins" (§15) isn't
 * this function's job: it produces a *suggestion* for `ToolConfig.risk`;
 * whether a human accepts or overrides it happens at configuration time.
 *
 * Privileged is checked before method-based signals deliberately: an
 * admin-shaped path is an authorization-boundary concern that dominates
 * HTTP semantics — a read-only admin endpoint is still worth flagging as
 * PRIVILEGED, not waved through as READ_ONLY.
 */
export function classifyOperation(op: CanonicalOperation): RiskAssessment {
  const reasons: string[] = [];
  const signal = `${op.path} ${op.operationId ?? ''}`;

  if (PRIVILEGED_PATTERN.test(signal)) {
    reasons.push(`Path or name suggests a privileged/administrative surface ("${op.path}")`);
    return { classification: 'PRIVILEGED', confidence: 0.7, reasons };
  }

  if (op.method === 'DELETE') {
    reasons.push('HTTP DELETE — irreversible by default');
    return { classification: 'DESTRUCTIVE', confidence: 0.9, reasons };
  }

  if (WRITE_METHODS.has(op.method) && (DESTRUCTIVE_ACTION_PATTERN.test(signal) || BULK_PATTERN.test(signal))) {
    reasons.push(`${op.method} with a destructive- or bulk-shaped path or name ("${op.path}")`);
    return { classification: 'DESTRUCTIVE', confidence: 0.8, reasons };
  }

  if (op.method === 'GET' || op.method === 'HEAD') {
    reasons.push(`HTTP ${op.method} — conventionally safe and idempotent`);
    return { classification: 'READ_ONLY', confidence: 0.85, reasons };
  }

  if (op.method === 'POST' && READ_LIKE_PATH_PATTERN.test(signal)) {
    reasons.push(`POST with a search/query-shaped path — likely read-only despite the method ("${op.path}")`);
    return { classification: 'READ_ONLY', confidence: 0.6, reasons };
  }

  if (WRITE_METHODS.has(op.method)) {
    reasons.push(`HTTP ${op.method} — a mutating method with no destructive or bulk signal detected`);
    return { classification: 'WRITE', confidence: 0.7, reasons };
  }

  reasons.push(`Method "${op.method}" does not map to a known risk pattern`);
  return { classification: 'UNKNOWN', confidence: 0.2, reasons };
}

export function classifyApi(api: CanonicalApi): Readonly<Record<string, RiskAssessment>> {
  return Object.fromEntries(api.operations.map((op) => [op.id, classifyOperation(op)]));
}
