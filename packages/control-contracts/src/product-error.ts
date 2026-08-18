import type { Diagnostic } from '@mcpgen/domain';

/** TIP §54. */
export interface ProductError {
  readonly code: string;
  readonly message: string;
  readonly category: 'IMPORT' | 'VALIDATION' | 'BINDING' | 'AUTH' | 'UPSTREAM' | 'MCP' | 'SECURITY' | 'GENERATION';
  readonly sourcePointer?: string;
  readonly toolName?: string;
  readonly remediation?: string;
}

/**
 * Table-driven off the §88 error-code catalog (code prefix -> category).
 * `PLG-*` (playground) and `DIFF-*` (reconciliation, always 501 in this
 * build) are new prefixes this UI build introduces — registered in §88 in
 * the same PR that adds them, so the catalog doesn't drift from what's
 * actually thrown. Covered by a test asserting every known prefix maps.
 */
const CATEGORY_BY_PREFIX = {
  IMP: 'IMPORT',
  VAL: 'VALIDATION',
  CFG: 'VALIDATION',
  BND: 'BINDING',
  AUT: 'AUTH',
  UPS: 'UPSTREAM',
  MCP: 'MCP',
  SEC: 'SECURITY',
  GEN: 'GENERATION',
  PLG: 'SECURITY',
  DIFF: 'VALIDATION',
} as const satisfies Record<string, ProductError['category']>;

/** Unmapped prefixes fall back to VALIDATION (the most generic bucket) rather than throwing — a production error path is the wrong place to crash on a missing catalog entry. The completeness test is what actually guards against drift. */
export function diagnosticToProductError(diagnostic: Diagnostic): ProductError {
  const prefix = diagnostic.code.split('-')[0] ?? '';
  const category = (CATEGORY_BY_PREFIX as Record<string, ProductError['category'] | undefined>)[prefix] ?? 'VALIDATION';

  return {
    code: diagnostic.code,
    message: diagnostic.message,
    category,
    ...(diagnostic.sourcePointer !== undefined ? { sourcePointer: diagnostic.sourcePointer } : {}),
    ...(diagnostic.operationId !== undefined ? { toolName: diagnostic.operationId } : {}),
  };
}
