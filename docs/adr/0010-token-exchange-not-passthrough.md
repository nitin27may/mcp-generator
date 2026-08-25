# ADR-0010 — User-delegated upstream access is token exchange, never passthrough

- **Status:** Accepted — **MANDATORY** (security invariant)
- **Date:** 2026-08-21
- **Amends:** [ADR-0005](0005-separate-auth-planes.md), which this narrows rather than overturns
- **Relates to:** TIP §18, §19 · BRD `FR-AUTH-UP-003` · [R11](https://github.com/nitin27may/mcp-generator/blob/main/docs/RISKS.md), [R14](https://github.com/nitin27may/mcp-generator/blob/main/docs/RISKS.md)

## Context

ADR-0005 states the invariant plainly: *there is no code path by which a Plane A token reaches an
upstream request.* That has been easy to hold because the two planes could not touch — Plane B
resolves a credential from configuration and Plane A did not exist at all until `P6-W23-E01`.

The scenario that forces the question is the common one. An API applies per-user authorization: an
agent acting for Alice must see Alice's orders, not Bob's. A Plane B client-credentials token
carries the *server's* identity, so every caller looks identical to the upstream and per-user
authorization silently collapses into "whatever the service account can see". That is not a niche
requirement; for most enterprise APIs it is the requirement.

Three ways to serve it, and the choice matters more than it first appears.

**Forward the caller's token upstream.** This is the convenient implementation and a specification
**MUST NOT**. The upstream cannot distinguish a token the MCP server was *given* from one it was
meant to *present*, so every upstream becomes a confused deputy (R11). Rejected outright.

**Run an authorization-code flow from the MCP server.** This is what people usually picture when
they say "the MCP server does OAuth". It does not survive contact with the execution model: a tool
call is headless. There is no browser to redirect, no session to park a `state` in, and no user
present to consent — a `tools/call` arrives, runs, and returns. Making it work means the server
becomes a stateful web app with its own callback endpoint, its own per-user token store, and its own
session cookie, which is a different product. BRD `FR-AUTH-UP-003` lists authorization code as a
requirement; TIP §19 and R14 already defer it as XL. This ADR explains why deferring it is the right
answer permanently, not just a scheduling decision.

**Exchange the caller's token for an upstream one (RFC 8693).** The MCP server presents the verified
inbound token to the *authorization server* as a `subject_token` and receives back a token minted for
the upstream API, carrying the user's identity and only the scopes the exchange policy allows. No
browser, no session, no consent surface — because consent already happened, at the point the client
obtained the Plane A token.

## Decision

1. **User-delegated upstream access is implemented as RFC 8693 token exchange.** A new
   `oauth2TokenExchange` arm of `upstreamAuthentication`.
2. **The upstream `authorization_code` grant stays permanently out of scope** for the generated
   runtime. A headless tool call has no consent surface, and simulating one would make the generated
   server a stateful web application. Recorded here so the question is not reopened as an oversight.
3. **ADR-0005's invariant is narrowed, not weakened.** The correct statement is now: *the Plane A
   token is never presented to the upstream API.* It may be presented to the **authorization server**
   — the party that issued it and can already validate it — and only as an RFC 8693 `subject_token`.
   Sending a token back to its own issuer discloses nothing the issuer does not already hold.
4. **Exchange happens after verification, never before.** Only a token that has passed signature,
   issuer, expiry and audience checks may be used as a `subject_token`. Exchanging an unverified
   token would hand an attacker-supplied credential straight to the authorization server.
5. **`upstream-auth` still may not import `mcp-protocol`.** The subject token arrives as a plain
   string argument. The boundary rule is unchanged and still enforced.

## Consequences

**Positive.** Per-user upstream authorization becomes expressible without a confused deputy. The
blast radius of a compromised MCP server is bounded by the exchange policy configured at the
authorization server, not by a service account's full scope. It composes with Plane A: the same
issuer that authorizes callers governs what they may reach.

**Negative.** Token exchange is not universally supported — Entra ID's on-behalf-of flow is close but
not identical, and Keycloak gates it behind a feature flag. Deployments whose IdP lacks it fall back
to client credentials and lose per-user authorization. The token cache becomes per-subject rather
than per-client, so its memory profile scales with active users instead of staying constant.

**The invariant is now enforced by a test rather than by structure.** Before this, passthrough was
impossible because the planes could not reach each other; now they touch by design, and only
`packages/test-fixtures/test/security/token-passthrough.test.ts` stands between "exchanged correctly"
and "forwarded verbatim". That test moves from a formality to the actual control.

## Enforcement

- **Token-passthrough regression test** (ADR-0005's, extended): with token exchange configured, the
  upstream request must carry the *exchanged* token and must not contain the inbound one anywhere.
- **`boundaries` script**, unchanged: `upstream-auth` must not import `mcp-protocol`.
- **Subject tokens are never cache keys.** The exchange cache keys on a hash, so a heap dump or a
  cache-inspection log cannot yield a usable credential.
- **Runtime-acquired tokens join the redaction secret set**, so an upstream error body echoing one
  back is scrubbed like any statically-bound secret (ADR-0006).
