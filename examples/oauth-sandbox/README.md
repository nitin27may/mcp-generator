# OAuth sandbox

A self-contained rig for exercising both of `mcpgen`'s authentication planes against a real
identity provider: **Keycloak**, a **protected Orders API**, a **classic SSO page** for
comparison, and a **generated MCP server** that sits between them.

Nothing here talks to the internet, and every credential in this directory is disposable and
local-only. It exists to answer one question honestly — *does the OAuth story actually work end
to end, or does it only look like it does?*

## What this demonstrates

Two planes, deliberately separate (see [ADR-0005](../../docs/adr/0005-separate-auth-planes.md)):

| Plane | Question it answers | How the sandbox shows it |
|---|---|---|
| **A — MCP access** | Who is allowed to call this MCP server? | `/mcp` answers `401` until you present a Keycloak token minted *for it* |
| **B — upstream** | What credential does the server present to the Orders API? | An RFC 8693 **exchanged** token, carrying your identity — never the token you presented |

The thing worth watching is `callerIdentity` in the `list_orders` response. It is the Orders
API telling you whose identity actually arrived. Under token exchange it says `user:alice`.
Switch the config to client credentials and it says `service:mcp-server`, and Alice's tool call
starts returning Bob's orders too — which is precisely the failure mode token exchange exists to
remove. It is more convincing to watch that change than to read about it.

## The flow, and the part people usually get wrong

Under MCP 2026-07-28 the MCP server is an OAuth 2.0 **Resource Server**. It does **not** perform
the redirect. The client does.

```
MCP client                    MCP server                 Keycloak                Orders API
    │                              │                         │                        │
    ├─ POST /mcp (no token) ──────▶│                         │                        │
    │◀── 401 + WWW-Authenticate ───┤                         │                        │
    │                              │                         │                        │
    ├─ GET /.well-known/oauth-protected-resource ───────────▶│ (served by MCP server) │
    │◀── "the AS is Keycloak" ─────┤                         │                        │
    │                              │                         │                        │
    ├─ browser: /authorize + PKCE ─────────────────────────▶ │                        │
    │◀── redirect to MY callback with a code ────────────────┤                        │
    ├─ POST /token (code + verifier) ──────────────────────▶ │                        │
    │◀── access token, aud = the MCP server ─────────────────┤                        │
    │                              │                         │                        │
    ├─ POST /mcp + Bearer ────────▶│                         │                        │
    │                              ├─ verify sig/iss/exp/aud │                        │
    │                              ├─ RFC 8693 exchange ────▶│                        │
    │                              │◀── token, aud = orders-api                       │
    │                              ├─ GET /orders + exchanged token ─────────────────▶│
    │◀── tool result ──────────────┤                         │                        │
```

The redirect belongs to the **client**, and the callback lands on the **client's** loopback
port. If you were expecting the MCP server to bounce a browser through Keycloak and back to
itself, that is the one detail to un-learn — and it makes the server's job much smaller:
publish discovery, verify the token, bind the audience.

Run `/` on the [SSO demo](#4-optional-the-same-flow-you-already-know) to see the ordinary
version of this side by side. It is the same shape, with the page playing the client's part.

## Prerequisites

- Docker with Compose v2
- Node.js ≥ 22.11 and `pnpm`, with this repo built once: `pnpm install && pnpm build` from the
  repo root
- **Linux, or Docker Desktop with host networking enabled.** The Orders API and SSO demo use
  `network_mode: host` so that `localhost:8280` means the same thing inside the containers, in
  your browser, and in the MCP server. Issuer URLs have to agree *exactly* across all three, and
  sharing the host's loopback is the least surprising way to guarantee it. If host networking is
  unavailable, run those two services directly instead: `node orders-api/server.mjs` and
  `node sso-demo/server.mjs`, having first run `npm install` in `orders-api/`.

## 1. Start the identity provider and the API

```bash
cd examples/oauth-sandbox
docker compose up --build
```

Wait for Keycloak to report ready — the first start imports the realm and takes 30–60s.

| Service | URL | Notes |
|---|---|---|
| Keycloak | http://localhost:8280 | admin console: `admin` / `sandbox-e2e-admin-not-a-real-credential` |
| Orders API | http://localhost:8281 | `/health` is open; everything else needs a token |
| SSO demo | http://localhost:8282 | the ordinary browser flow |

The realm `mcpgen` is created from [`keycloak/realm-export.json`](keycloak/realm-export.json)
on every start, with:

- **Users** `alice` and `bob`, password `sandbox-e2e-password-not-a-real-credential`
- **Scopes** `orders:read`, `orders:write`, `mcp:tools`
- **`mcp-inspector`** — public + PKCE, the MCP client
- **`mcp-server`** — confidential, token exchange enabled; both the Plane A audience and the
  exchange client
- **`orders-api`** — bearer-only, the upstream audience
- **`sso-demo`** — public + PKCE, the comparison app

Confirm the API really is protected:

```bash
curl -i http://localhost:8281/orders          # 401, no token
curl -s http://localhost:8281/health          # {"status":"ok"}
```

## 2. Generate the MCP server from the spec

The Orders API publishes its own spec, so import it the same way you would any real API:

```bash
cd ../..                                       # repo root
curl -s http://localhost:8281/openapi.json -o /tmp/orders.openapi.json

node apps/cli/dist/mcpgen.mjs init \
  --spec /tmp/orders.openapi.json --out /tmp/orders.mcp.config.json --enable-read-only
```

Read what `init` did before moving on. Two things are worth noticing:

- `deleteOrder` is classified **DESTRUCTIVE** and is **not** enabled, even though you asked for
  read-only enablement — destructive operations are never turned on for you (BR-006,
  [ADR-0008](../../docs/adr/0008-destructive-retry-disabled-by-default.md)).
- The `authorizationCode` flow in the spec is **not** seeded into the config. Only
  `clientCredentials` is expressible as upstream auth today; the delegated case is token
  exchange, which no OpenAPI security scheme can describe, so it is always a deliberate choice.

A ready-made config that makes that choice is checked in at
[`mcp/mcp.config.json`](mcp/mcp.config.json) — use it for the rest of the walkthrough.

It differs from what `init` produced in one more way worth understanding. `mcpAccess.resource`
is this server's own URL, because RFC 9728 discovery is derived from it, but `mcpAccess.audience`
is pinned to `mcp-server`. Those are the same value in the RFC 8707 model and different in
practice: Keycloak mints its *client id* as the audience, Entra ID mints `api://<guid>`, Auth0
mints an API identifier. `mcpgen` accepts either form — a resource URL matched hierarchically, or
an opaque identifier matched exactly — which is what makes Plane A usable against a real
enterprise IdP at all.

## 3. Run the MCP server with both planes live

```bash
cd examples/oauth-sandbox
cp .env.example .env

cd ../..
node apps/cli/dist/mcpgen.mjs serve \
  --transport http --host 127.0.0.1 --port 8290 \
  --config examples/oauth-sandbox/mcp/mcp.config.json \
  --spec /tmp/orders.openapi.json \
  --dotenv examples/oauth-sandbox/.env
```

```json
{"level":"info","message":"serving","data":{"tools":2,"transport":"http","url":"http://127.0.0.1:8290/mcp","authorization":"oauth2"}}
```

`"authorization":"oauth2"` is the line to check. If it says `"none"`, the `mcpAccess` block did
not resolve and the endpoint is wide open — stop and fix that before going further.

Note `"tools":2`. The config ships four operations and enables two; `create_order` is a WRITE
and `delete_order` is DESTRUCTIVE, and neither is turned on for you (BR-006,
[ADR-0008](../../docs/adr/0008-destructive-retry-disabled-by-default.md)).

Now watch it refuse an anonymous call, and say where to authenticate:

```bash
curl -i -X POST http://127.0.0.1:8290/mcp \
  -H 'content-type: application/json' -H 'MCP-Protocol-Version: 2026-07-28' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

```
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer error="invalid_token", error_description="Missing Authorization header",
  scope="mcp:tools", resource_metadata="http://127.0.0.1:8290/.well-known/oauth-protected-resource/mcp"
```

Follow that pointer. This is exactly what an MCP client does next, and it needs no token:

```bash
curl -s http://127.0.0.1:8290/.well-known/oauth-protected-resource/mcp
```

```json
{
  "resource": "http://127.0.0.1:8290/mcp",
  "authorization_servers": ["http://localhost:8280/realms/mcpgen"],
  "scopes_supported": ["mcp:tools"],
  "resource_name": "orders-mcp"
}
```

## 4. Call a tool as a real signed-in user

Get a token the way a person would. The realm enables direct access grants on `mcp-inspector`
so this works from a shell; a real MCP client performs the authorization-code redirect above and
ends up with the identical token.

```bash
TOKEN=$(curl -s -X POST http://localhost:8280/realms/mcpgen/protocol/openid-connect/token \
  -d grant_type=password -d client_id=mcp-inspector \
  -d username=alice -d password=sandbox-e2e-password-not-a-real-credential \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
```

Decode it and note what it is *for*:

```
aud = mcp-server        scope = mcp:tools        preferred_username = alice
```

`mcp-inspector` grants only `mcp:tools` by default — `orders:read` is an *optional* scope it
never asks for. So this token names the MCP server and nothing else, which is what makes the
next two commands a real demonstration rather than a coincidence.

**The caller's token is useless against the Orders API:**

```bash
curl -s http://localhost:8281/orders -H "authorization: Bearer $TOKEN"
```

```json
{"error":"unauthorized","detail":"token audience [\"mcp-server\"] does not include \"orders-api\""}
```

**And yet the tool call works, as Alice:**

```bash
curl -s -X POST http://127.0.0.1:8290/mcp \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: list_orders' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_orders","arguments":{},
       "_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28",
                "io.modelcontextprotocol/clientInfo":{"name":"sandbox-curl","version":"1.0"},
                "io.modelcontextprotocol/clientCapabilities":{}}}}'
```

```json
{
  "items": [
    { "id": "ord-1001", "customer": "alice", "status": "shipped", "total": 42.5 },
    { "id": "ord-1002", "customer": "alice", "status": "pending", "total": 18 }
  ],
  "callerIdentity": "user:alice"
}
```

Two of the three seeded orders. Bob's is absent, and `callerIdentity` is `user:alice`.

That pair of results *is* the proof. The token you sent cannot reach the Orders API — you just
watched it be refused — so the token that did reach it was a different one: exchanged at
Keycloak, minted for `orders-api`, still carrying Alice. Plane A's credential stopped at the MCP
server, exactly as [ADR-0005](../../docs/adr/0005-separate-auth-planes.md) and
[ADR-0010](../../docs/adr/0010-token-exchange-not-passthrough.md) require.

The same property is asserted permanently in CI rather than only here —
`packages/test-fixtures/test/security/token-passthrough.test.ts` and
`token-exchange-delegation.test.ts` run on every push.

### See the failure mode it prevents

Switch `upstreamAuthentication.type` from `oauth2TokenExchange` to `oauth2ClientCredentials`
(drop `audience`, keep `scopes: ["orders:read"]`), restart, and repeat the identical call as
Alice:

```json
{
  "items": [
    { "id": "ord-1001", "customer": "alice" },
    { "id": "ord-1002", "customer": "alice" },
    { "id": "ord-2001", "customer": "bob" }
  ],
  "callerIdentity": "service:mcp-server"
}
```

**Bob's order is now in Alice's result.** Nothing errored, nothing warned — per-user
authorization simply stopped existing, because the Orders API was handed a service identity and
had no user to scope to. That single observation is the entire argument for ADR-0010.

## 5. Optional: the same flow you already know

Open http://localhost:8282 and sign in as `alice`. The page redirects to Keycloak, gets a code
back, exchanges it with PKCE, and calls the Orders API — the ordinary SSO flow, with the page
playing the part the MCP client plays above. Compare its token's `aud` and `scope` claims with
the MCP one; they are the two claims the generated server checks on every request.

## Tearing down

```bash
docker compose down -v
```

Everything is disposable: the realm, its users, its clients, its secrets.

## Security note

**Nothing in this directory is safe outside a local machine.** Keycloak runs in `start-dev` with
`--http-enabled` and no TLS; the MCP config sets `dangerouslyAllowInsecureIssuer`, which
`mcpgen` accepts *only* for a loopback issuer and refuses for any remote plaintext one; and every
password and client secret is committed in plain text on purpose, so it is obvious they are
disposable. Real deployments use HTTPS issuers and a secret manager — see
[ADR-0006](../../docs/adr/0006-secrets-are-references-only.md).
