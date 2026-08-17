/**
 * TIP §10.4 / BRD FR-VAL-002: findings are classified, never just thrown away.
 * Order matters — `error` blocks generation (BR-005); the rest inform the user.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'recommendation' | 'info';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  /** Stable code, e.g. one of the §88 error codes (VAL-001, SEC-004, ...). */
  readonly code: string;
  readonly message: string;
  /** JSON pointer into the source document, when the finding traces to one. */
  readonly sourcePointer?: string;
  readonly operationId?: string;
}

const SEVERITY_RANK: Readonly<Record<DiagnosticSeverity, number>> = {
  error: 0,
  warning: 1,
  recommendation: 2,
  info: 3,
};

/** Errors sort first; stable within a severity band (no reordering of equals). */
export function compareDiagnosticSeverity(a: Diagnostic, b: Diagnostic): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
