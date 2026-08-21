# ADR-0005 — Upstream authentication and MCP authorization are separate planes

- **Status:** Accepted — **MANDATORY** (TIP §66 Decision 5)
- **Date:** 2026-08-17
- **Relates to:** TIP §18, §19, §26.2 · BRD FR-AUTH-UP-005, FR-AUTH-MCP-003, BR-007, BR-008

## Context

An MCP server that proxies a REST API sits between two credential relationships:

```text
MCP Client  --(Plane A: MCP access token)-->  MCP Server  --(Plane B: API credential)-->  REST API
```

The convenient implementation is to take the bearer token the client presented and forward it
upstream. It requires no configuration and appears to work whenever both sides happen to trust the
same issuer.

It is also forbidden, and it is a confused-deputy vulnerability. A token minted for our MCP server
is not a token for the customer's API; forwarding it either fails or — worse — succeeds against a
resource that never consented to that audience.

**This is normative, not stylistic.** MCP 2026-07-28 authorization security considerations, verified
2026-08-17:

> *"If the MCP server makes requests to upstream APIs, it may act as an OAuth client to them. The
> access token used at the upstream API is a separate token, issued by the upstream authorization
> server. The MCP server **MUST NOT** pass through the token it received from the MCP client."*

and:

> *"MCP servers **MUST** only accept tokens specifically intended for themselves and **MUST** reject
> tokens that do not include them in the audience claim."*

## Decision

The two planes are separately configured and structurally incapable of sharing a credential.

- **Plane A (MCP access)** is configured under `mcpAccess`. It applies to HTTP-hosted MCP. Inbound
  tokens are audience-validated and rejected if not intended for this server. Under stdio, the
  process boundary *is* the connection mechanism and no network authorization layer is required.
- **Plane B (upstream)** is configured under `upstreamAuthentication` and resolves through
  `ValueBinding` — API key, bearer, or basic at V1; OAuth client credentials later. Credentials come
  from environment or a secret provider.
- There is **no code path** by which a Plane A token reaches an upstream request. The
  `upstream-auth` package has no access to inbound MCP request credentials and may not import
  `mcp-protocol`.

## Consequences

**Positive.** Specification-compliant. The failure mode when a customer misconfigures is an explicit
"upstream credential not found" (`AUT-001`), not a silent privilege escalation. The two planes evolve
independently — hosted MCP authorization (P6) does not touch upstream auth. Security review has one
clear invariant to check.

**Negative.** More configuration for users, who must supply an upstream credential even when the two
identity systems are the same. User-delegated upstream OAuth becomes genuinely hard (TIP §19, XL) and
is deliberately deferred, so some legitimate scenarios are not served at MVP.

## Enforcement

- `boundaries` script: `upstream-auth` must not import `mcp-protocol`. The auth planes cannot see
  each other. — `tooling/scripts/boundaries.mjs`, rule `auth-planes-separate`.
- **Token-passthrough regression test** in the `security` suite (TIP §86) — a permanent test, not a
  one-time check. — `packages/test-fixtures/test/security/token-passthrough.test.ts`. It runs both
  planes at once against the real CLI binary, with deliberately distinct sentinels, and asserts
  three things: the upstream receives the configured Plane B credential, the inbound Plane A token
  appears nowhere in the upstream request, and a refused caller token reaches the upstream not at
  all.
- Error code `SEC-006` exists specifically to make a blocked passthrough attempt legible. — emitted
  by `checkAccessPosture` in `packages/mcp-runtime/src/access.ts` when an HTTP transport binds
  beyond loopback with no `mcpAccess` configured.
- Plane A's own rejection paths are covered separately in
  `packages/test-fixtures/test/security/mcp-access.test.ts`: wrong audience, expired, missing `exp`,
  foreign signing key, wrong issuer, and insufficient scope.
- BR-007 and BR-008 are MVP/MUST invariants: a release violating either is not shippable.

## Status of the two planes

Plane A landed with `P6-W23-E01`: `packages/mcp-protocol/src/mcp-access.ts` builds an
`OAuthTokenVerifier` over the authorization server's JWKS and binds the audience with the SDK's
`checkResourceAllowed`; `serve-http.ts` publishes the RFC 9728 and RFC 8414 discovery documents and
gates `/mcp` behind it. Note what this does *not* do: the server never performs an authorization
redirect. Under MCP 2026-07-28 it is a Resource Server, so the redirect belongs to the client, and
the server's obligations are discovery, verification and audience binding.

Plane B supports API key, bearer, basic and OAuth2 client credentials. User-delegated upstream
access remains unbuilt; when it lands it will be RFC 8693 token exchange rather than an
authorization-code flow, because a headless tool call has no browser and no consent surface. That
is the point at which the two planes first touch, and the passthrough test above is what keeps the
invariant honest through that change.
