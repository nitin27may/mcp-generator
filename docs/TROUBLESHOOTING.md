# Troubleshooting

Every diagnostic `mcpgen` emits carries a code. This is what each one means and what to do
about it — the codes are stable identifiers, so they are safe to search for and safe to
match on in scripts.

Diagnostics go to **stderr**, always, on both transports. `stdout` carries the JSON-RPC
protocol stream and nothing else; a stray `console.log` would corrupt it, which is why
`no-console` is an error in every runtime package rather than a style preference.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | The operation ran and failed. Diagnostics were emitted — read them. |
| `2` | A usage error: unknown command or flag, invalid flag value. Nothing was attempted. |

The distinction matters in CI. A `2` means your invocation is wrong; a `1` means your
invocation was fine and the *content* — a spec, a config, a missing credential — was not.

## Import and validation — `IMP-*`, `VAL-*`, `MCP-*`

### `IMP-001` — unsupported OpenAPI version

Supported: Swagger 2.0, OpenAPI 3.0, OpenAPI 3.1. A 2.0 or 3.0 document is upgraded to 3.1
internally before anything else runs, and you will see `IMP-006` when that happens.

> The README badge claims OpenAPI 3.2. That is not accurate today — the 3.2 adapter is
> deferred (`P1-W03-T03`). A 3.2 document will report `IMP-001`.

### `IMP-003` — malformed document

The spec did not validate. The message carries the parser's own text and a JSON Pointer to
the offending node. This is a problem with your document, not with `mcpgen`; validating it
against a dedicated OpenAPI linter usually gives a clearer message.

### `IMP-006` — document auto-upgraded (informational)

Not a problem. Your Swagger 2.0 or OpenAPI 3.0 document was normalized to 3.1 for
processing. Worth knowing because the operation ids and schema shapes you see downstream are
the *upgraded* ones.

### `VAL-001` — reference resolution warning

A `$ref` could not be resolved but the document is still usable. Common with specs that
reference sibling files you did not import, or remote URLs that are unreachable. The affected
operations may be missing schema detail.

### `MCP-006` — schema could not be normalized for MCP

An operation's schema does not convert cleanly to JSON Schema 2020-12. The tool is usually
still generatable; its input schema will be less precise.

### `BND-006` — invalid `x-mcp-header`

An `x-mcp-header` extension in your spec is malformed. The message names the header.

## Configuration — `CFG-*`, `BND-*`, `GEN-*`

### `CFG-001` — config could not be read or parsed

Either the file is not where you said it was, is not valid JSON, or does not match the
schema. Unknown keys are a hard error rather than being ignored, so a typo like
`requiredScope` for `requiredScopes` lands here rather than silently doing nothing.

Point your editor at [`schemas/mcp.config.schema.json`](https://github.com/nitin27may/mcp-generator/blob/main/schemas/mcp.config.schema.json)
via a `$schema` key and most of these become visible before you run anything — see
[`CONFIG.md`](CONFIG.md#editor-support).

### `BND-003` — invalid binding in config

A binding is structurally wrong: a `secret` carrying a literal `value`, a `tool-input`
binding where only deployment values are allowed, an environment name that is not
`UPPER_SNAKE_CASE`.

### `GEN-004` — tool references an operation that does not exist

A tool's `sourceOperation.internalOperationId` does not match anything in the spec. Almost
always means the config and the spec have drifted — the spec was re-exported and an operation
was renamed or removed. Re-run `init` against the new spec and re-apply your choices.

### `GEN-006` — generated output too large

The generated package exceeded the size limit. Usually an enormous spec with hundreds of
enabled tools; enable fewer.

## Startup and credentials — `AUT-*`, `BND-005`, `SEC-*`

### `BND-005` — unresolved environment variable

A binding names an environment variable that is not set. The message names it.

This and `AUT-001` are the two you will see most often, and usually together — running
`validate` in a shell with no deployment variables set reports both **by design**. Catching
them before `serve` starts is the entire purpose of `validate`.

```bash
export ORDERS_API_URL=https://api.example.com
export ORDERS_API_KEY=...
# or, without exporting into your shell:
mcpgen validate --config mcp.config.json --spec openapi.json --dotenv ./local.env
```

### `AUT-001` — upstream credential not found

A `secret` binding named a variable that is not set. Same fix as `BND-005`; the separate code
exists because a missing credential is a different kind of problem from a missing base URL,
and you may want to alert on it differently.

Also emitted when `mcpAccess` cannot be initialised at all — a bad issuer URL, or an
authorization server that could not be reached. The server refuses to start rather than
listening in an unknown state.

### `AUT-003` — OAuth token acquisition or exchange failed

The token endpoint rejected the request or was unreachable. The message reports the **status
only**, deliberately: an RFC 6749 error body can echo the request back, and the request
contains a client secret or a subject token.

Check, in order: is `tokenUrl` right; is the client secret set and current; does the client
have the requested scopes; and for `oauth2TokenExchange`, is token exchange actually enabled
for that client at the identity provider (Keycloak gates it behind a per-client flag).

For token exchange specifically, this also appears when there is **no verified caller** —
`oauth2TokenExchange` requires `mcpAccess.mode: "oauth2"` on an HTTP transport. Without one
there is nothing to exchange, and falling back to the server's own identity would silently
turn a delegated configuration into an impersonating one.

### `SEC-005` — header injection refused

A value bound into a header contained a carriage return or line feed. The request was not
constructed. This is almost always untrusted input reaching a header binding.

### `SEC-006` — HTTP transport exposed without authorization (warning)

You are serving MCP over HTTP on a non-loopback address with no `mcpAccess` configured, which
means every tool on that server is callable by anyone who can reach the port.

A warning rather than an error, because binding a protected network is a legitimate
deployment decision this process cannot second-guess. Either configure `mcpAccess`
([`CONFIG.md`](CONFIG.md#mcpaccess--plane-a)) or bind loopback only.

## Runtime — `UPS-*`

### `UPS-000` — upstream request failed

A network-level failure. The message carries the underlying reason. Note that request URLs
are never logged with their query string, because an api-key-in-query binding would put the
credential there.

### `UPS-001` — upstream request timed out

The upstream did not respond within the timeout. Retries never exceed the overall deadline,
so this can also mean the retry budget was consumed.

### `UPS-003` — response too large

The upstream response exceeded the size limit and was rejected. It is **not** truncated:
half a JSON document is not a usable result, so the whole response is refused instead.

There is no pagination or projection layer yet — that is a known limitation, not a
misconfiguration.

### `UPS-004` — unexpected content type

The upstream returned a content type outside the allowed set. Commonly an HTML error page
from a proxy in front of the real API.

## Plane A rejections (HTTP transport)

These are HTTP responses rather than diagnostic codes, since they go to the caller:

| Status | `WWW-Authenticate` | Cause |
|---|---|---|
| `401` | `error="invalid_token"` | No token, malformed token, bad signature, wrong issuer, expired, no `exp`, **or wrong audience** |
| `403` | `error="insufficient_scope"` | Valid token, missing a required scope |

The `401` always carries `resource_metadata`, pointing at
`/.well-known/oauth-protected-resource`. That is how a client discovers where to
authenticate, so it is served without a token.

**Wrong audience is the one people hit and misread.** A token that is correctly signed by the
right issuer and has not expired will still be refused if it was not minted *for this
server*. That is a normative MUST, not a hardening option — without it, a token issued for
any other service protected by the same authorization server would be accepted here.

If you are seeing this against a real identity provider, check what your IdP actually puts in
`aud`. Keycloak mints the client id, Entra ID mints `api://<guid>`, Auth0 mints an API
identifier — none of which are the resource URL. Set `mcpAccess.audience` to whatever your
IdP really emits ([`CONFIG.md`](CONFIG.md#mcpaccess--plane-a)).

## Things that look like bugs and are not

**`validate` reports `BND-005` and `AUT-001` on a fresh clone.** Expected. No deployment
credentials are set in that shell. See above.

**A `DELETE` operation is not enabled after `--enable-read-only`.** Correct. Destructive
operations are never enabled for you, whatever you ask for (BR-006,
[ADR-0008](adr/0008-destructive-retry-disabled-by-default.md)). Enable it by name, deliberately.

**`init` ignored the `authorizationCode` flow in my spec.** Correct. Only
`clientCredentials` is expressible as upstream auth from a spec. The delegated case is RFC
8693 token exchange, which no OpenAPI security scheme can describe, so it is always a
deliberate configuration choice ([ADR-0010](adr/0010-token-exchange-not-passthrough.md)).

**Cancelling a tool call does not stop the upstream request.** Known limitation
(`P1-W13-T01`): `notifications/cancelled` is not yet wired to the upstream `AbortSignal`, so
the call runs to completion or timeout.

**The wizard has no login.** By design. It is a local tool with no accounts and no database,
and projects expire on a TTL. Do not expose it beyond localhost.

## Still stuck

- [`CONFIG.md`](CONFIG.md) — every config field
- [`OAUTH.md`](OAUTH.md) — both authentication planes, with a runnable sandbox
- [`examples/oauth-sandbox/`](https://github.com/nitin27may/mcp-generator/tree/main/examples/oauth-sandbox/) — a working stack to compare against
- Open an issue with the exit code, the diagnostic codes, and a minimal spec fragment —
  **never** a real credential or internal hostname.
