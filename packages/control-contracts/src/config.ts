import { z } from 'zod';

/**
 * `PUT /api/projects/:id/config` body. Full replace, not a partial patch —
 * the config is the durable artifact (ADR-0001). `expectedRevision` is the
 * optimistic-concurrency token against `ProjectSnapshot.configRevision`; a
 * mismatch means another session (e.g. a second browser tab) saved first —
 * the server responds 409 rather than silently clobbering (TIP §51 D2).
 *
 * `config` is deliberately `z.unknown()` here, not `McpProjectConfigSchema`:
 * this schema only validates the request *envelope* shape. The route calls
 * `parseProjectConfig()` itself so a business-rule failure (bad regex, a
 * BR-002 name collision, ...) produces a 422 with `CFG-001`-coded
 * `ProductError[]`+`sourcePointer` rather than a generic 400 — the two are
 * different failure categories (malformed request vs. unprocessable config).
 */
export const UpdateConfigRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    config: z.unknown(),
  })
  .strict();
export type UpdateConfigRequest = z.infer<typeof UpdateConfigRequestSchema>;
