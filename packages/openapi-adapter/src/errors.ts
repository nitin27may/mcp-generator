import type { Diagnostic } from '@mcpgen/domain';

/** Scalar's own error shape (research notes §12) — kept internal, per ADR-0003. */
export interface ScalarErrorObject {
  readonly path?: string[];
  readonly message: string;
  readonly code?: string;
}

function pointerFrom(path: string[] | undefined): string | undefined {
  if (!path || path.length === 0) return undefined;
  return `#/${path.join('/')}`;
}

/** §88 IMP-003: "Malformed {format} at {pointer}" — the closest fit for a general validation failure. */
export function toValidationDiagnostic(error: ScalarErrorObject): Diagnostic {
  const pointer = pointerFrom(error.path);
  return {
    severity: 'error',
    code: 'IMP-003',
    message: error.message,
    ...(pointer !== undefined ? { sourcePointer: pointer } : {}),
  };
}

/** Non-fatal: `dereference()` can report ref issues without invalidating the document. */
export function toDereferenceDiagnostic(error: ScalarErrorObject): Diagnostic {
  const pointer = pointerFrom(error.path);
  return {
    severity: 'warning',
    code: 'VAL-001',
    message: error.message,
    ...(pointer !== undefined ? { sourcePointer: pointer } : {}),
  };
}

export function unsupportedVersionDiagnostic(version: string | undefined): Diagnostic {
  return {
    severity: 'error',
    code: 'IMP-001',
    message: `Unsupported OpenAPI version "${version ?? 'unknown'}" — only 3.1 is supported in this build`,
  };
}
