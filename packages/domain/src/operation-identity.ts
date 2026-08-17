/**
 * TIP §7 — `operationId` alone is not a stable identity; teams rename it. The tiered
 * fallback (explicit stable ID -> operationId+method+path -> method+normalized-path)
 * is what makes reconciliation (BRD FR-REC-*) possible across spec revisions.
 */
export interface OperationIdentity {
  readonly internalId: string;
  readonly operationId?: string;
  readonly method: string;
  readonly normalizedPath: string;
  readonly sourceFingerprint: string;
  readonly semanticFingerprint: string;
}

/**
 * Collapses path parameter *names* to a placeholder so `/pets/{id}` and
 * `/pets/{petId}` normalize identically — the fallback identity tier is
 * `method + normalized path`, and a cosmetic rename must not break it.
 */
export function normalizeOperationPath(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{}');
}
