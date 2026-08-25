# `mcp.config.json` reference

This file is the product.

Everything else — the wizard, the CLI, the generated package — exists to produce it or to
execute it. It is the artifact you commit, review in a pull request, and diff when someone
changes what an agent is allowed to do. A generated server is disposable; regenerate it any
time from this file and the spec.

Two properties are worth stating before the field list, because they explain most of the
design:

**It never contains a credential.** Only the *name* of the variable one is read from. This is
not a convention, it is enforced at the type level and by `.strict()` validation: a
`secret` binding has no `value` field, so a config carrying a literal is a hard error rather
than something silently stripped ([ADR-0006](adr/0006-secrets-are-references-only.md)).

**Unknown keys are rejected, not ignored.** A misspelled `requiredScope` fails loudly
instead of validating as "no scopes required".

## Editor support

```json
{
  "$schema": "./node_modules/@nitin27may/mcpgen/mcp.config.schema.json",
  "schemaVersion": "1.0"
}
```

The schema is generated from the same zod definitions the CLI validates against
([`schemas/mcp.config.schema.json`](https://github.com/nitin27may/mcp-generator/blob/main/schemas/mcp.config.schema.json), also shipped inside
the npm package), and a test fails if the two ever diverge. `$schema` is the one otherwise
unknown key the config accepts, precisely so it can be referenced.

## Top level

| Key | Required | What it is |
|---|---|---|
| `$schema` | no | Editor pointer. Ignored at run time. |
| `schemaVersion` | **yes** | `"1.0"`. The compatibility contract — see [Versioning](#versioning). |
| `project` | **yes** | Name and description. The name becomes the MCP server's identity. |
| `api` | **yes** | Where the upstream API lives. |
| `mcpAccess` | no | **Plane A** — who may call this MCP server. |
| `upstreamAuthentication` | no | **Plane B** — the credential this server presents upstream. |
| `tools` | **yes** | The governed tool surface. |
| `generation` | **yes** | How the package is emitted. |

`mcpAccess` and `upstreamAuthentication` are deliberately separate keys and must stay that
way. They are different credentials with different blast radii, and no code path lets one
become the other ([ADR-0005](adr/0005-separate-auth-planes.md)).

## Value bindings

Anything that varies by deployment is a *binding* rather than a literal. Four kinds:

```jsonc
{ "source": "environment", "name": "ORDERS_API_URL", "required": true }  // read from env
{ "source": "secret",      "name": "ORDERS_API_KEY" }                    // a credential
{ "source": "static",      "value": "https://api.example.com" }          // fixed
{ "source": "tool-input",  "inputName": "customer_id" }                  // from the tool call
```

`environment` and `secret` differ in intent and in treatment: a `secret` is always required,
is registered with the redactor so it cannot appear in a response or a log, and — as above —
cannot carry a literal. Variable names are `UPPER_SNAKE_CASE`.

`tool-input` only makes sense where a value legitimately changes per call. A base URL bound
to tool input would let the caller choose which host to send credentials to, so the schema
does not permit it.

## `api`

```json
{ "api": { "baseUrl": { "source": "environment", "name": "ORDERS_API_URL", "required": true } } }
```

`baseUrl` accepts `environment` or `static` only.

## `mcpAccess` — Plane A

Who is allowed to call this server. Only meaningful for the Streamable HTTP transport; under
stdio the process boundary *is* the connection mechanism.

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

| Field | Required | Notes |
|---|---|---|
| `mode` | **yes** | `"oauth2"` or `"none"` |
| `issuer` | for oauth2 | Authorization server. Its RFC 8414 metadata and signing keys are discovered from here, so no endpoint needs listing by hand. |
| `resource` | for oauth2 | This server's public URL. RFC 9728 discovery is derived from it, so it must be a URL. |
| `audience` | no | What `aud` is checked against, when that is not the resource URL. |
| `requiredScopes` | no | A token missing any is refused `403`. |
| `jwksUri` | no | Overrides the discovered `jwks_uri`. |
| `dangerouslyAllowInsecureIssuer` | no | Permits an `http://` issuer **on loopback only**. |

`mode: "none"` is spelled out rather than inferred from absence, so a reviewer can tell an
unprotected server from one where somebody forgot.

**On `audience` vs `resource`.** These are the same value in the RFC 8707 model and different
in practice: Keycloak mints its client id, Entra ID mints `api://<guid>`, Auth0 mints an API
identifier. `resource` still has to be the real URL because discovery is built from it, so
the audience gets its own field. Opaque audiences are matched by exact equality — never by
prefix, so `orders-api-staging` cannot satisfy a server configured as `orders-api`.

The server never performs an authorization redirect. Under MCP 2026-07-28 it is a Resource
Server: the client redirects, and the server publishes discovery, verifies the token, and
binds the audience. See [`OAUTH.md`](OAUTH.md).

## `upstreamAuthentication` — Plane B

The credential this server presents to the upstream API. Five types.

```jsonc
// A key in a header or query parameter
{ "type": "apiKey", "in": "header", "name": "X-API-Key", "value": { "source": "secret", "name": "API_KEY" } }

// A static token
{ "type": "bearer", "token": { "source": "secret", "name": "API_TOKEN" } }

// Username and password
{ "type": "basic",
  "username": { "source": "environment", "name": "API_USER" },
  "password": { "source": "secret", "name": "API_PASSWORD" } }

// Machine-to-machine: the server acts as itself
{ "type": "oauth2ClientCredentials",
  "tokenUrl": "https://idp.example.com/oauth2/token",
  "clientId":     { "source": "environment", "name": "CLIENT_ID" },
  "clientSecret": { "source": "secret",      "name": "CLIENT_SECRET" },
  "scopes": ["orders:read"] }

// Delegated: the server acts as the signed-in caller (RFC 8693)
{ "type": "oauth2TokenExchange",
  "tokenUrl": "https://idp.example.com/oauth2/token",
  "clientId":     { "source": "environment", "name": "EXCHANGE_CLIENT_ID" },
  "clientSecret": { "source": "secret",      "name": "EXCHANGE_CLIENT_SECRET" },
  "audience": "orders-api",
  "scopes": ["orders:read"] }
```

Choosing between the last two matters more than it looks. `oauth2ClientCredentials` carries
the *server's* identity, so every caller looks identical to the upstream and per-user
authorization silently stops working. `oauth2TokenExchange` trades the caller's verified
token for one minted for the upstream, so a tool call acts as the person who made it. It
requires `mcpAccess.mode: "oauth2"` — without a verified caller there is nothing to exchange,
and the server refuses rather than quietly falling back to its own identity
([ADR-0010](adr/0010-token-exchange-not-passthrough.md)).

`clientSecret` and `password` are narrowed to `secret` bindings: they are never anything else.

> **Known limitation.** `tokenUrl` is a plain string rather than a binding, so unlike
> `issuer` and `resource` it cannot come from an environment variable, and one config
> cannot move between environments without editing. Tracked for a `schemaVersion` bump.

## `tools`

A map of tool key → configuration. Every tool starts **disabled**; nothing is enabled for
you, and destructive operations are never auto-enabled regardless of what you pass to `init`
(BR-006, [ADR-0008](adr/0008-destructive-retry-disabled-by-default.md)).

```json
{
  "tools": {
    "get_order": {
      "enabled": true,
      "name": "get_order",
      "description": "Fetch a single order by id.",
      "risk": "READ_ONLY",
      "sourceOperation": {
        "internalOperationId": "getOrder",
        "method": "GET",
        "path": "/orders/{orderId}",
        "operationId": "getOrder"
      },
      "bindings": { "orderId": { "source": "tool-input", "inputName": "order_id" } }
    }
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `enabled` | **yes** | Disabled tools are not exposed at all. |
| `name` | **yes** | What the agent sees. Must be unique across *enabled* tools (BR-002). |
| `description` | **yes** | What the agent reads to decide whether to call it. |
| `risk` | **yes** | `READ_ONLY` · `WRITE` · `DESTRUCTIVE` · `PRIVILEGED` |
| `sourceOperation` | **yes** | Which spec operation this came from. `internalOperationId` is the link. |
| `bindings` | **yes** | Parameter name → where its value comes from. |
| `retry` | no | Retry policy. Disabled for destructive operations regardless. |

`risk` is not decorative: it gates retry eligibility, drives the confirmation prompt in the
playground, and is why a `DELETE` is never enabled by an `--enable-read-only` run.

## `generation`

```json
{
  "generation": {
    "packageName": "@acme/orders-mcp",
    "binName": "orders-mcp",
    "version": "0.1.0",
    "transports": ["stdio"],
    "emitDockerfile": true,
    "mode": "thin"
  }
}
```

| Field | Notes |
|---|---|
| `packageName` | npm name of the generated package. Validated as a real npm name. |
| `binName` | The command the generated package exposes. |
| `version` | Version of the generated package, not of `mcpgen`. |
| `transports` | `["stdio"]`, `["http"]`, or both. |
| `emitDockerfile` | Whether to emit a `Dockerfile`. |
| `mode` | `"thin"` (runtime as a dependency) or `"self-contained"`. |

## Versioning

`schemaVersion` — not the CLI version — is the compatibility contract. It is `"1.0"` and
changes only when the shape changes incompatibly. Pre-1.0 of the CLI, flag names and
diagnostic codes may still change within a minor release; the config shape is the thing held
stable.

There is no config migration framework yet (`P1-W29-T01`), so a future `schemaVersion` bump
will come with instructions rather than an automatic upgrade.

## See also

- [`CLI.md`](CLI.md) — the commands that read and write this file
- [`OAUTH.md`](OAUTH.md) — both authentication planes end to end
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — what the diagnostic codes mean
