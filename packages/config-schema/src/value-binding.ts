import { z } from 'zod';

/**
 * TIP §11.2 / ADR-0006. Every schema here is `.strict()`, and that is load-
 * bearing, not decoration: Zod's default `z.object()` behavior *silently
 * strips* unknown keys rather than rejecting them (verified in the research
 * notes §13). Without `.strict()`, a `SecretBinding` carrying a leaked
 * literal `value` field would validate successfully with the leak quietly
 * discarded — hiding the exact mistake this schema exists to catch, from the
 * person who made it. `.strict()` turns that into a hard validation error.
 */

// House convention: uppercase snake case, matching real-world env var naming
// and what ends up literally interpolated into a shell/.env context.
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export const ToolInputBindingSchema = z
  .object({
    source: z.literal('tool-input'),
    inputName: z.string().min(1),
  })
  .strict();

export const EnvironmentBindingSchema = z
  .object({
    source: z.literal('environment'),
    name: z.string().regex(ENV_NAME, 'must be UPPER_SNAKE_CASE'),
    required: z.boolean().optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const SecretBindingSchema = z
  .object({
    source: z.literal('secret'),
    name: z.string().regex(ENV_NAME, 'must be UPPER_SNAKE_CASE'),
    provider: z.enum(['environment', 'vault-reference']).optional(),
    // Deliberately no `value` field. `.strict()` rejects one if present.
  })
  .strict();

export const StaticBindingSchema = z
  .object({
    source: z.literal('static'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    // A sensitive static value is a secret binding by another name — reject it.
    sensitive: z.literal(false).optional(),
  })
  .strict();

export const ValueBindingSchema = z.discriminatedUnion('source', [
  ToolInputBindingSchema,
  EnvironmentBindingSchema,
  SecretBindingSchema,
  StaticBindingSchema,
]);

export type ToolInputBinding = z.infer<typeof ToolInputBindingSchema>;
export type EnvironmentBinding = z.infer<typeof EnvironmentBindingSchema>;
export type SecretBinding = z.infer<typeof SecretBindingSchema>;
export type StaticBinding = z.infer<typeof StaticBindingSchema>;
export type ValueBinding = z.infer<typeof ValueBindingSchema>;
