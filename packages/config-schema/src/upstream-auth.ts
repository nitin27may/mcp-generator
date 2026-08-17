import { z } from 'zod';
import { SecretBindingSchema, ValueBindingSchema } from './value-binding.js';

/** TIP §19 V1 — API key, bearer, basic. OAuth is V1.5+, out of scope here. */
export const ApiKeyAuthSchema = z
  .object({
    type: z.literal('apiKey'),
    in: z.enum(['header', 'query']),
    name: z.string().min(1),
    value: ValueBindingSchema,
  })
  .strict();

export const BearerAuthSchema = z
  .object({
    type: z.literal('bearer'),
    token: ValueBindingSchema,
  })
  .strict();

export const BasicAuthSchema = z
  .object({
    type: z.literal('basic'),
    username: ValueBindingSchema,
    // Deliberately narrower than ValueBinding: a password is always a secret.
    password: SecretBindingSchema,
  })
  .strict();

export const UpstreamAuthenticationSchema = z.discriminatedUnion('type', [
  ApiKeyAuthSchema,
  BearerAuthSchema,
  BasicAuthSchema,
]);

export type ApiKeyAuth = z.infer<typeof ApiKeyAuthSchema>;
export type BearerAuth = z.infer<typeof BearerAuthSchema>;
export type BasicAuth = z.infer<typeof BasicAuthSchema>;
export type UpstreamAuthentication = z.infer<typeof UpstreamAuthenticationSchema>;
