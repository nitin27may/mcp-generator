import { normalize } from '@scalar/openapi-parser';

/**
 * Real-world OpenAPI documents are overwhelmingly YAML, not JSON (TIP §6.1
 * says "OpenAPI/Swagger" without restricting format). `normalize()` is the
 * same format-detection scalar's own `validate`/`dereference` use internally
 * — calling it explicitly here means callers (the CLI) get a plain object
 * back regardless of source format, instead of every caller needing its own
 * YAML-vs-JSON branch.
 */
export function normalizeOpenApiSource(raw: string): unknown {
  return normalize(raw);
}
