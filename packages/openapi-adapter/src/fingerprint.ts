import { createHash } from 'node:crypto';

/**
 * Deterministic content hash — key order in the input must not affect the
 * result, since two byte-different-but-equivalent documents (or the same
 * document re-serialized) should fingerprint identically (TIP §7).
 */
export function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  // JSON.stringify(undefined) returns undefined (not a string) — e.g. a document
  // that failed to parse into anything at all. Fall back to String() so this
  // function never crashes for any `unknown` input, matching its signature.
  return JSON.stringify(sortKeysDeep(value)) ?? String(value);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}
