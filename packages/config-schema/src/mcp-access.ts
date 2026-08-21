import { z } from 'zod';
import { EnvironmentBindingSchema, StaticBindingSchema } from './value-binding.js';

/**
 * Plane A — who may call THIS MCP server (ADR-0005, TIP §18.1, FR-AUTH-MCP-002/003/004).
 *
 * Distinct from `upstreamAuthentication`, which is Plane B: the credential this server
 * presents to the upstream API. The two never mix, and no value configured here is ever
 * attached to an upstream request.
 *
 * Only meaningful for the Streamable HTTP transport. Under stdio the client *is* the
 * parent process — the process boundary is the connection mechanism, so there is no
 * network authorization layer to configure and this block is ignored.
 *
 * Per MCP 2026-07-28, a server enforcing this acts as an OAuth 2.0 Resource Server: it
 * publishes RFC 9728 Protected Resource Metadata, answers an unauthenticated request
 * with `401` + `WWW-Authenticate`, and validates that the presented token was issued
 * *for it* — the audience check is a normative MUST, not a hardening option. The
 * authorization redirect itself belongs to the client; a server never performs one.
 */

/** A deployment-fixed URL: differs per environment, never per call — same shape as `api.baseUrl`. */
const DeploymentUrlBinding = z.discriminatedUnion('source', [EnvironmentBindingSchema, StaticBindingSchema]);

/**
 * The explicit opt-out. Spelling "no authorization" as a real mode rather than
 * letting the block be absent means a reviewer can tell an unprotected server apart
 * from one where somebody forgot to configure it.
 */
export const McpAccessNoneSchema = z
  .object({
    mode: z.literal('none'),
  })
  .strict();

export const McpAccessOAuth2Schema = z
  .object({
    mode: z.literal('oauth2'),
    /**
     * The authorization server's issuer identifier. Its RFC 8414 metadata
     * (`/.well-known/oauth-authorization-server`) and signing keys are discovered from
     * here at startup, so no endpoint needs listing by hand.
     */
    issuer: DeploymentUrlBinding,
    /**
     * This server's own public URL — the RFC 8707 resource identifier a client requests
     * a token *for*, and the value the `aud` claim is checked against. Getting this
     * wrong is the confused-deputy bug (R11): a token minted for another service would
     * otherwise be accepted here.
     */
    resource: DeploymentUrlBinding,
    /** Overrides the `jwks_uri` from discovery. Only needed when an AS misreports it. */
    jwksUri: DeploymentUrlBinding.optional(),
    /** Scopes every caller must present. A token missing any is refused `403`. */
    requiredScopes: z.array(z.string().min(1)).optional(),
    /**
     * Permits an `http://` issuer. Local testing only — a plaintext issuer means tokens
     * and discovery documents cross the wire unprotected. Named to be uncomfortable to
     * type, and surfaced as a startup warning whenever it is on.
     */
    dangerouslyAllowInsecureIssuer: z.boolean().optional(),
  })
  .strict();

export const McpAccessSchema = z.discriminatedUnion('mode', [McpAccessNoneSchema, McpAccessOAuth2Schema]);

export type McpAccessNone = z.infer<typeof McpAccessNoneSchema>;
export type McpAccessOAuth2 = z.infer<typeof McpAccessOAuth2Schema>;
export type McpAccess = z.infer<typeof McpAccessSchema>;
