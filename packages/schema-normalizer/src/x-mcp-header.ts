import type { Diagnostic } from '@mcpgen/domain';

/**
 * TIP §92.1 / BRD FR-BIND-007. Verified in docs/research/sdk-v2-api-notes.md §6:
 * the MCP SDK passes `x-mcp-header` through to `tools/list` **unvalidated**.
 * A conforming client must exclude a tool whose annotation violates the
 * specification's constraints from `tools/list` — silently, with no error.
 * That makes this validation ours, and it has to run at configuration time,
 * not runtime: an invalid annotation doesn't throw, it just makes the tool
 * disappear.
 *
 * Constraints (MCP 2026-07-28, Streamable HTTP transport, "Schema Extension"):
 *  - non-empty
 *  - a valid HTTP field-name token (RFC 9110 §5.1: 1*tchar)
 *  - case-insensitively unique among all x-mcp-header values in one inputSchema
 *  - only on properties of type string, integer, or boolean (NOT number)
 *  - only on properties statically reachable from the root via a chain of
 *    `properties` keys — not through `items`, `oneOf`/`anyOf`/`allOf`/`not`,
 *    `if`/`then`/`else`, or `$ref`
 *
 * The integer-safe-range constraint is a call-time value check, not a
 * schema-shape check, so it's out of scope here — it belongs wherever tool
 * arguments are validated against resolved values.
 */

const HTTP_FIELD_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const ALLOWED_PRIMITIVE_TYPES: ReadonlySet<string> = new Set(['string', 'integer', 'boolean']);

interface Occurrence {
  readonly pointer: string;
  readonly headerName: string;
  readonly propertyType: unknown;
  readonly reachableViaPropertiesOnly: boolean;
}

function collect(node: unknown, pointer: string, reachableViaPropertiesOnly: boolean, out: Occurrence[]): void {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
  const obj = node as Record<string, unknown>;

  if (typeof obj['x-mcp-header'] === 'string') {
    out.push({ pointer, headerName: obj['x-mcp-header'], propertyType: obj.type, reachableViaPropertiesOnly });
  }

  const properties = obj.properties;
  if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [key, sub] of Object.entries(properties as Record<string, unknown>)) {
      collect(sub, `${pointer}/properties/${key}`, reachableViaPropertiesOnly, out);
    }
  }

  // Every other path breaks static reachability — descend anyway so a
  // misplaced annotation is still found and reported, just marked invalid.
  if (obj.items !== undefined) collect(obj.items, `${pointer}/items`, false, out);
  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
    const branches = obj[keyword];
    if (Array.isArray(branches)) {
      branches.forEach((branch, index) => collect(branch, `${pointer}/${keyword}/${index}`, false, out));
    }
  }
  if (obj.not !== undefined) collect(obj.not, `${pointer}/not`, false, out);
  if (obj.if !== undefined) collect(obj.if, `${pointer}/if`, false, out);
  if (obj.then !== undefined) collect(obj.then, `${pointer}/then`, false, out);
  if (obj.else !== undefined) collect(obj.else, `${pointer}/else`, false, out);
}

function isAllowedPrimitive(type: unknown): boolean {
  if (typeof type === 'string') return ALLOWED_PRIMITIVE_TYPES.has(type);
  if (Array.isArray(type)) return type.length > 0 && type.every((t) => ALLOWED_PRIMITIVE_TYPES.has(String(t)));
  return false;
}

function violation(pointer: string, headerName: string, message: string): Diagnostic {
  return { severity: 'error', code: 'BND-006', message: `x-mcp-header "${headerName}": ${message}`, sourcePointer: pointer || '#' };
}

/** @param inputSchema The fully assembled tool input schema — not a single parameter's schema. */
export function validateMcpHeaderAnnotations(inputSchema: unknown): Diagnostic[] {
  const occurrences: Occurrence[] = [];
  collect(inputSchema, '', true, occurrences);

  const diagnostics: Diagnostic[] = [];
  const seenByLowercaseName = new Map<string, string>();

  for (const occ of occurrences) {
    const { pointer, headerName, propertyType, reachableViaPropertiesOnly } = occ;

    if (headerName.length === 0) {
      diagnostics.push(violation(pointer, headerName, 'must not be empty'));
      continue;
    }
    if (!HTTP_FIELD_NAME_TOKEN.test(headerName)) {
      diagnostics.push(violation(pointer, headerName, 'is not a valid HTTP field-name token'));
      continue;
    }
    if (!reachableViaPropertiesOnly) {
      diagnostics.push(
        violation(pointer, headerName, 'is not statically reachable via a properties-only chain from the schema root'),
      );
      continue;
    }
    if (!isAllowedPrimitive(propertyType)) {
      diagnostics.push(violation(pointer, headerName, 'is only permitted on string, integer, or boolean properties'));
      continue;
    }

    const lower = headerName.toLowerCase();
    const existingPointer = seenByLowercaseName.get(lower);
    if (existingPointer !== undefined) {
      diagnostics.push(violation(pointer, headerName, `duplicates the annotation at ${existingPointer} case-insensitively`));
    } else {
      seenByLowercaseName.set(lower, pointer);
    }
  }

  return diagnostics;
}
