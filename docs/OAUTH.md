# Authentication

Two planes, deliberately separate ([ADR-0005](adr/0005-separate-auth-planes.md)):

| | Question | Config key |
|---|---|---|
| **Plane A** | Who may call this MCP server? | `mcpAccess` |
| **Plane B** | What credential does this server present to the API? | `upstreamAuthentication` |

They are different credentials with different blast radii, and no code path lets one become
the other. `upstream-auth` is forbidden from importing `mcp-protocol`, enforced on every
push, and a permanent regression test asserts on the wire that the inbound token never
reaches the upstream.

## The part people get wrong

> **The MCP server never performs the authorization redirect.**

Under MCP 2026-07-28 the server is an OAuth 2.0 **Resource Server**. The *client* opens the
browser, receives the callback, and exchanges the code. The server's job is three things:
publish discovery metadata, verify the presented token, and check it was minted for *it*.

```
MCP client                       MCP server                  Identity provider
    │                                 │                              │
    ├─ POST /mcp (no token) ─────────▶│                              │
    │◀─ 401 + WWW-Authenticate ───────┤                              │
    │                                 │                              │
    ├─ GET /.well-known/oauth-protected-resource ───▶ (the server)   │
    │◀─ "the AS is <issuer>" ─────────┤                              │
    │                                 │                              │
    ├─ browser: /authorize + PKCE ───────────────────────────────────▶│
    │◀─ redirect to MY callback with a code ──────────────────────────┤
    ├─ POST /token (code + verifier) ────────────────────────────────▶│
    │◀─ access token, aud = the MCP server ───────────────────────────┤
    │                                 │                              │
    ├─ POST /mcp + Bearer ───────────▶│ verify sig, iss, exp, aud    │
```

If you were expecting the server to bounce a browser through the IdP and back to itself, that
is the detail to un-learn — and it makes the server's job much smaller.

## Plane A — who may call this server

Only meaningful on the HTTP transport. Under stdio the process boundary *is* the connection
mechanism; there is no network to authorize.

```json
{
  "mcpAccess": {
    "mode": "oauth2",
    "issuer":   { "source": "environment", "name": "MCP_ISSUER_URL", "required": true },
    "resource": { "source": "environment", "name": "MCP_PUBLIC_URL", "required": true },
    "audience": "mcp-server",
    "requiredScopes": ["mcp:tools"]
  }
}
```

The issuer is all you configure. Its RFC 8414 metadata and signing keys are discovered from
it at startup, and if that discovery fails the server refuses to start rather than listening
in an unknown state.

What gets checked on every request: signature against the published JWKS, issuer, expiry
(a token with no `exp` is refused), **audience**, and any required scopes.

### Audience is the check that matters

A correctly signed, unexpired token from the right issuer is still refused if it was not
minted for this server. That is a normative MUST — without it, a token issued for any other
service protected by the same authorization server would be accepted here. It is the
confused-deputy bug, tracked as R11.

`resource` must be this server's real URL, because RFC 9728 discovery is derived from it.
`audience` is what `aud` is compared against, and exists because real identity providers
disagree about what an audience is:

| Provider | What it puts in `aud` |
|---|---|
| RFC 8707 / MCP model | the resource URL |
| Keycloak | the client id — `mcp-server` |
| Entra ID | `api://<guid>` |
| Auth0 | the API identifier |

Opaque audiences are matched by **exact equality**, never by prefix — `orders-api-staging`
cannot satisfy a server configured as `orders-api`. If Plane A rejects tokens from your IdP,
decode one and look at `aud` before anything else.

### Responses

| Status | Meaning |
|---|---|
| `401` `invalid_token` | Missing, malformed, bad signature, wrong issuer, expired, no `exp`, or **wrong audience** |
| `403` `insufficient_scope` | Valid token, missing a required scope |

Both carry `WWW-Authenticate` with `resource_metadata`, which is how a client discovers where
to authenticate. Discovery and `/health` are served **without** a token — a client cannot
obtain one until it has read discovery.

### If you do not configure it

The endpoint is unauthenticated. That is defensible for the default loopback bind and
indefensible anywhere else, so binding beyond loopback without `mcpAccess` emits `SEC-006`.
`"mode": "none"` says the same thing explicitly, so a reviewer can tell a deliberate choice
from an oversight.

## Plane B — what this server presents upstream

Five types. The first four are configuration; the fifth is the interesting one.

| Type | The server acts as | Use when |
|---|---|---|
| `apiKey` | itself | a key in a header or query parameter |
| `bearer` | itself | a static token |
| `basic` | itself | username and password |
| `oauth2ClientCredentials` | **itself** | machine-to-machine, no per-user authorization |
| `oauth2TokenExchange` | **the caller** | the API applies per-user authorization |

### Why the last row exists

An API that scopes data per user cannot be served by client credentials. That token carries
the *server's* identity, so every caller looks identical to the upstream and per-user
authorization silently stops existing — no error, no warning, just Bob's data in Alice's
result. The sandbox demonstrates exactly this, because it is more convincing to watch than
to read.

RFC 8693 token exchange fixes it: the server presents the caller's *verified* token to the
authorization server as a `subject_token` and receives one minted for the upstream API,
carrying the user's identity.

```json
{
  "upstreamAuthentication": {
    "type": "oauth2TokenExchange",
    "tokenUrl": "https://idp.example.com/oauth2/token",
    "clientId":     { "source": "environment", "name": "EXCHANGE_CLIENT_ID" },
    "clientSecret": { "source": "secret",      "name": "EXCHANGE_CLIENT_SECRET" },
    "audience": "orders-api",
    "scopes": ["orders:read"]
  }
}
```

Requires `mcpAccess.mode: "oauth2"` — without a verified caller there is nothing to exchange,
and the server errors rather than quietly falling back to its own identity.

### Why not an authorization-code flow upstream?

Because a tool call is headless. There is no browser to redirect, no session to park a
`state` in, and no user present to consent — a `tools/call` arrives, runs, and returns.
Supporting it would make the generated server a stateful web application with its own
callback endpoint, per-user token store and session cookie. That is a different product, and
[ADR-0010](adr/0010-token-exchange-not-passthrough.md) records the decision as permanent
rather than deferred.

### And never passthrough

Forwarding the caller's token to the upstream is the convenient implementation and a
specification **MUST NOT**. The upstream cannot distinguish a token the server was *given*
from one it was meant to *present*.

Token exchange narrows that invariant rather than weakening it: the caller's token goes to
the **authorization server that issued it** — which can already validate it, so nothing is
disclosed — and never to the API. That distinction is the entire content of ADR-0010, and
it is what `token-passthrough.test.ts` and `token-exchange-delegation.test.ts` assert on
every push.

## Try it

[`examples/oauth-sandbox/`](https://github.com/nitin27may/mcp-generator/tree/main/examples/oauth-sandbox/) runs the whole thing on loopback:
Keycloak, a protected Orders API, a classic SSO page for comparison, and the generated MCP
server.

```bash
cd examples/oauth-sandbox
docker compose up --build
```

Its walkthrough is a verified transcript — every command and response in it was executed
against the running stack. It builds to a pair of observations rather than an assertion:
Alice's token is *refused* by the Orders API directly, and yet her tool call succeeds and
returns only her own orders. The token that reached the upstream was therefore a different
one.

It also shows the failure mode: switch to client credentials, repeat the identical call, and
Bob's order appears in Alice's result.

## Verification status

Both planes have been exercised end to end against a real identity provider (Keycloak 26),
not only against in-repo fixtures. That run is what the sandbox README records, and it found
three real defects — most notably that the audience check originally understood only URLs,
which would have made Plane A unusable against Keycloak, Entra ID and Auth0 alike.

Permanent coverage in CI:

| Suite | What it proves |
|---|---|
| `mcp-access.test.ts` | Every Plane A rejection path: wrong audience, expired, no `exp`, foreign key, wrong issuer, insufficient scope |
| `serve-http-access.test.ts` | Transport wiring: discovery and health open, `/mcp` gated, Origin checked first |
| `token-passthrough.test.ts` | Both planes live, distinct sentinels — the inbound token reaches the upstream nowhere |
| `token-exchange-delegation.test.ts` | The upstream receives an *exchanged* token carrying the caller |

## See also

- [`CONFIG.md`](CONFIG.md) — every field of both blocks
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — `AUT-003`, `SEC-006`, and reading a `401`
- [ADR-0005](adr/0005-separate-auth-planes.md) · [ADR-0010](adr/0010-token-exchange-not-passthrough.md)
