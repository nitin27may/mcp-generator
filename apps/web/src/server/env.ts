import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  MCPGEN_WORKSPACE_ROOT: z.string().min(1).default(join(tmpdir(), 'mcpgen-workspace')),
  MCPGEN_PROJECT_TTL_HOURS: z.coerce.number().positive().default(168),
  MCPGEN_STAGING_TTL_HOURS: z.coerce.number().positive().default(1),
  MCPGEN_MAX_UPLOAD_BYTES: z.coerce.number().positive().default(10_485_760),
  /**
   * Security-relevant — off by default. Opts the playground's live-execute
   * egress into private/loopback targets, for local development against a
   * fixture API. Deliberately not `z.coerce.boolean()` — that coerces via
   * JS truthiness of the raw string, so the literal string `"false"` would
   * coerce to `true` (a non-empty string). Only the literal `"true"`/`"1"` enable it.
   */
  MCPGEN_ALLOW_PRIVATE_EGRESS: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parsed fresh on every call rather than once at module-load time — an
 * eagerly-evaluated top-level `export const env = ...` reads `process.env`
 * the instant this module is first imported, which is unpredictable in
 * Next.js's module graph and makes per-test workspace isolation impossible
 * (an env var set in a test's `beforeAll` always runs after the module's
 * own top-level code, by the time any `import` has already executed). The
 * parse itself is a handful of cheap zod checks — not a hot-path cost worth
 * caching for a low-traffic control-plane API.
 */
export function getEnv(): Env {
  return EnvSchema.parse({
    MCPGEN_WORKSPACE_ROOT: process.env.MCPGEN_WORKSPACE_ROOT,
    MCPGEN_PROJECT_TTL_HOURS: process.env.MCPGEN_PROJECT_TTL_HOURS,
    MCPGEN_STAGING_TTL_HOURS: process.env.MCPGEN_STAGING_TTL_HOURS,
    MCPGEN_MAX_UPLOAD_BYTES: process.env.MCPGEN_MAX_UPLOAD_BYTES,
    MCPGEN_ALLOW_PRIVATE_EGRESS: process.env.MCPGEN_ALLOW_PRIVATE_EGRESS,
  });
}
