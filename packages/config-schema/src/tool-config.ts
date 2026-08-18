import { z } from 'zod';
import { ValueBindingSchema } from './value-binding.js';

/** BRD FR-RISK-001 */
export const ToolRiskSchema = z.enum(['READ_ONLY', 'WRITE', 'DESTRUCTIVE', 'PRIVILEGED', 'UNKNOWN']);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

/**
 * Conservative P0 placeholder pending the SDK's own naming constraints being
 * formalized behind the adapter (P1). Matches common MCP tool-naming
 * convention; not yet cited to a specific spec clause — see FR-NAME-003.
 * Exported so the wizard's live tool-name validation (Tool Designer) checks
 * against the exact same pattern the schema enforces server-side, rather
 * than a second copy that could drift.
 */
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * TIP §21: retry eligibility defaults from HTTP method (GET/HEAD on; PUT/
 * POST/DELETE/PATCH off). `enabled` lets a tool override that default in
 * either direction — e.g. a PUT that's genuinely idempotent, or a GET that
 * happens to trigger a side effect upstream and must never be retried.
 * `DESTRUCTIVE`/`PRIVILEGED` risk classification overrides this at the
 * upstream-http layer regardless (BR-006) — not configurable, by design.
 */
export const RetryConfigSchema = z.object({ enabled: z.boolean() }).strict();
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

export const SourceOperationRefSchema = z
  .object({
    internalOperationId: z.string().min(1),
    method: z.string().min(1),
    path: z.string().min(1),
    operationId: z.string().min(1).optional(),
  })
  .strict();

/**
 * TIP §12, trimmed to what P0's hand-authored config needs. Group
 * inheritance, runtime policy overrides, and AI provenance are P1+
 * (config-schema's inheritance engine is `P1-W05-T01`) — added when a task
 * actually needs them, not speculatively.
 */
export const ToolConfigSchema = z
  .object({
    enabled: z.boolean(),
    sourceOperation: SourceOperationRefSchema,
    name: z.string().regex(TOOL_NAME_PATTERN, 'must match ^[a-zA-Z0-9_-]{1,128}$'),
    description: z.string().min(1),
    bindings: z.record(z.string(), ValueBindingSchema),
    risk: ToolRiskSchema,
    retry: RetryConfigSchema.optional(),
  })
  .strict();

export type SourceOperationRef = z.infer<typeof SourceOperationRefSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
