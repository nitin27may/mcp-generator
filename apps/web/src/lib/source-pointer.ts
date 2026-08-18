/**
 * Best-effort JSON-pointer → line-number resolution for the read-only source
 * view's "jump to finding" affordance. Not a full JSON/YAML AST walk (that's
 * more machinery than a jump-to-line needs) — it unescapes the pointer's
 * last non-numeric segment (RFC 6901: `~1` → `/`, `~0` → `~`) and returns the
 * first line containing that key as a quoted string, which is correct for
 * the vast majority of OpenAPI documents where property names are unique
 * enough locally to disambiguate.
 */
export function resolveSourcePointerLine(rawText: string, pointer: string): number | undefined {
  const segments = pointer.split('/').filter((segment) => segment.length > 0);
  const key = [...segments].reverse().find((segment) => !/^\d+$/.test(segment));
  if (key === undefined) return undefined;

  const unescaped = key.replaceAll('~1', '/').replaceAll('~0', '~');
  const lines = rawText.split('\n');
  const index = lines.findIndex((line) => line.includes(`"${unescaped}"`) || line.includes(`${unescaped}:`));
  return index === -1 ? undefined : index + 1;
}
