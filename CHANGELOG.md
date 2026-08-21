# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**What "compatible" means here.** Pre-1.0, the contract is `mcp.config.json`'s `schemaVersion`
— currently `"1.0"` — not the CLI version. A config that validates today will keep validating.
Flag names, diagnostic codes and CLI output may still change within a `0.x` minor; the config
shape is the thing held stable.

History before the first release is not itemized below. Nothing was ever published, so there is
no version anyone could have been running; `git log` has the detail.

## [Unreleased]

The surface as it stands, at feature altitude.

### Added

- **Import** — Swagger 2.0, OpenAPI 3.0 and 3.1, with 2.0/3.0 normalized to 3.1 internally.
  Remote `$ref` resolution behind an SSRF guard with an IP blocklist.
- **Agent readiness analysis** — 30 deterministic rules, scored per category. No AI involved,
  and no network access ([ADR-0007](docs/adr/0007-deterministic-readiness-before-ai.md)).
- **Risk classification** — every operation classified `READ_ONLY` / `WRITE` / `DESTRUCTIVE` /
  `PRIVILEGED`. Destructive operations are never enabled automatically, and retry is disabled
  for them regardless of configuration
  ([ADR-0008](docs/adr/0008-destructive-retry-disabled-by-default.md)).
- **Portable configuration** — `mcp.config.json` as the durable artifact, with a published
  JSON Schema at [`schemas/mcp.config.schema.json`](schemas/mcp.config.schema.json) generated
  from the same definitions the CLI validates against.
- **Secrets as references only** — configuration carries the *name* of a variable, never a
  value. Enforced at the type level and by strict validation
  ([ADR-0006](docs/adr/0006-secrets-are-references-only.md)).
- **Upstream authentication (Plane B)** — API key, bearer, basic, OAuth2 client credentials,
  and RFC 8693 token exchange for acting as the signed-in caller
  ([ADR-0010](docs/adr/0010-token-exchange-not-passthrough.md)).
- **MCP authorization (Plane A)** — the generated server acts as an OAuth 2.0 Resource Server
  over Streamable HTTP: RFC 9728 protected-resource metadata, RFC 8414 discovery, JWKS
  verification, and audience binding. Opaque audiences (Keycloak client ids, Entra
  `api://<guid>`) are supported alongside RFC 8707 resource URLs.
- **CLI** — `init`, `validate`, `serve`, `generate`, `print-tools`, `print-config`, with
  consistent exit codes and `--dotenv` support ([docs/CLI.md](docs/CLI.md)).
- **Web wizard** — a 10-step guided flow over the same engine, with a live playground.
- **Generated packages** — self-documenting output over stdio or Streamable HTTP, optionally
  containerized.
- **OAuth sandbox** — [`examples/oauth-sandbox/`](examples/oauth-sandbox/): Keycloak, a
  protected API, and a classic SSO page, for verifying both planes against a real identity
  provider.

### Known limitations

Listed in full in the [README](README.md#known-limitations). The ones most likely to matter:
cancellation is not propagated to in-flight upstream calls; OpenAPI 3.2 is not supported;
`upstreamAuthentication.tokenUrl` cannot come from an environment variable; oversized upstream
responses are rejected rather than paginated.

[Unreleased]: https://github.com/nitin27may/mcp-generator/commits/main
