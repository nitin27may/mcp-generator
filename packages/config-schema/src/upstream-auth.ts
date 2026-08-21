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

/**
 * TIP §19 V1.5, FR-AUTH-UP-003: client_credentials only (RFC 6749 §4.4) —
 * machine-to-machine, no human present during a tool call, which is the only
 * grant that fits an MCP server acting on its own behalf against an upstream
 * API. Authorization-code / user-delegated OAuth is a separate, explicitly
 * out-of-scope feature (TIP §19) — it needs a redirect/consent UX that has
 * no place in a headless tool execution path.
 */
export const OAuth2ClientCredentialsAuthSchema = z
  .object({
    type: z.literal('oauth2ClientCredentials'),
    tokenUrl: z.string().url(),
    clientId: ValueBindingSchema,
    // Deliberately narrower than ValueBinding: a client secret is always a secret.
    clientSecret: SecretBindingSchema,
    scopes: z.array(z.string().min(1)).optional(),
  })
  .strict();

/**
 * ADR-0010, RFC 8693. User-delegated upstream access: the verified inbound MCP access
 * token is presented to the AUTHORIZATION SERVER as a `subject_token` and exchanged for
 * one minted for the upstream API.
 *
 * This is what lets a tool call act as the caller rather than as the server's service
 * account, without ever forwarding the caller's token to the upstream — the thing
 * ADR-0005 forbids and MCP states as a MUST NOT.
 *
 * Only meaningful when `mcpAccess.mode` is `oauth2`; with no verified caller there is no
 * subject to exchange, and a tool call falls back to no upstream credential rather than
 * silently borrowing the server's own identity.
 *
 * Not expressible in OpenAPI — no `securityScheme` describes it — so `init` never seeds
 * this from a spec. It is always a deliberate configuration choice.
 */
export const OAuth2TokenExchangeAuthSchema = z
  .object({
    type: z.literal('oauth2TokenExchange'),
    tokenUrl: z.string().url(),
    clientId: ValueBindingSchema,
    // Deliberately narrower than ValueBinding: a client secret is always a secret.
    clientSecret: SecretBindingSchema,
    /** RFC 8693 `audience` — the upstream API the exchanged token should be minted for. */
    audience: z.string().min(1).optional(),
    scopes: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const UpstreamAuthenticationSchema = z.discriminatedUnion('type', [
  ApiKeyAuthSchema,
  BearerAuthSchema,
  BasicAuthSchema,
  OAuth2ClientCredentialsAuthSchema,
  OAuth2TokenExchangeAuthSchema,
]);

export type ApiKeyAuth = z.infer<typeof ApiKeyAuthSchema>;
export type BearerAuth = z.infer<typeof BearerAuthSchema>;
export type BasicAuth = z.infer<typeof BasicAuthSchema>;
export type OAuth2ClientCredentialsAuth = z.infer<typeof OAuth2ClientCredentialsAuthSchema>;
export type OAuth2TokenExchangeAuth = z.infer<typeof OAuth2TokenExchangeAuthSchema>;
export type UpstreamAuthentication = z.infer<typeof UpstreamAuthenticationSchema>;
