/**
 * OAS 3.1 Schema Objects carry a few keywords that are meaningful in an
 * OpenAPI document but not to an MCP tool consumer. Strip them; leave
 * everything else — including unrecognized `x-*` extensions such as
 * `x-mcp-header` (BRD FR-BIND-007) — untouched. This is deliberately a small,
 * explicit list rather than an allowlist: an allowlist would silently drop
 * future JSON Schema keywords this package doesn't yet know about.
 */
const OPENAPI_ONLY_KEYWORDS: ReadonlySet<string> = new Set(['discriminator', 'xml', 'externalDocs']);

export function sanitizeForMcp(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForMcp);

  if (schema !== null && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (OPENAPI_ONLY_KEYWORDS.has(key)) continue;
      out[key] = sanitizeForMcp(value);
    }
    return out;
  }

  return schema;
}
