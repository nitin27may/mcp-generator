/**
 * The verified caller of a tool invocation — Plane A's output, expressed without a
 * single protocol type (ADR-0005, ADR-0010).
 *
 * `mcp-protocol` maps the SDK's `AuthInfo` onto this at the transport boundary and nothing
 * downstream ever sees the SDK shape. That is what lets `mcp-runtime` and `upstream-auth`
 * carry a caller at all: the boundary linter forbids them from importing
 * `@modelcontextprotocol/*`, and ADR-0005 forbids `upstream-auth` from importing
 * `mcp-protocol`, so a shared vocabulary has to live somewhere neutral. `domain` has zero
 * dependencies by design and is that place.
 *
 * `token` is present for exactly one purpose: RFC 8693 token exchange, where it is sent to
 * the authorization server that issued it. It is never attached to an upstream request —
 * see ADR-0010 and the token-passthrough regression test.
 *
 * Undefined caller means no Plane A authorization was configured, or the transport is
 * stdio, where the process boundary is the connection mechanism.
 */
export interface CallerIdentity {
  /** The `sub` claim, when the authorization server issued one. */
  readonly subject?: string;
  /** The OAuth client the token was issued to. */
  readonly clientId: string;
  readonly scopes: readonly string[];
  /** Expiry, seconds since epoch. */
  readonly expiresAt?: number;
  /** The raw access token. Exchange input only — never an upstream credential. */
  readonly token: string;
}
