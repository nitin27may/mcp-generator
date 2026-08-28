# mcp-generator

**An Agent Readiness and Governance Layer for APIs.**

> Import OpenAPI. Configure once. Run MCP anywhere.

[![Docs](https://img.shields.io/badge/docs-nitinksingh.com-0f766e)](https://nitinksingh.com/mcp-generator/)
[![MCP](https://img.shields.io/badge/MCP-2026--07--28-0f766e)](docs/adr/0009-mcp-sdk-v2-and-modern-era.md)
[![Upstream auth config](https://img.shields.io/badge/upstream%20auth%20config-work%20in%20progress-c2410c)](#project-status)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-2.0%20%7C%203.0%20%7C%203.1-c2410c)](docs/BRD.md#102-openapi-import)
[![Node](https://img.shields.io/badge/node-22%20LTS-15803d)](docs/README.md)
[![License](https://img.shields.io/badge/license-MIT-64748b)](LICENSE)

## About

`mcp-generator` sits between enterprise APIs and AI agents. It ingests an OpenAPI/Swagger document,
scores whether the API is actually *fit* for agent consumption, lets a human curate a safe tool
surface, and emits a **portable MCP definition** (`mcp.config.json`) — the durable artifact, not
generated source — that a shared runtime executes over stdio or Streamable HTTP. Direct
endpoint-to-tool conversion produces a weak production surface: too many tools, ambiguous names,
unsafe write/delete operations, secrets pasted into configuration. The question this answers is not
*"how do I convert this API to MCP?"* but *"which parts of our API ecosystem should agents be
allowed to use, and how should they safely use them?"*

```
OpenAPI / Swagger → Validation + Normalization → Agent Readiness Analysis → Governed Tool Design
                                                                                    ↓
                                                          Portable MCP Definition ← the product
                                                                                    ↓
                                                    stdio · Streamable HTTP · Docker · hosted (later)
```

| | Basic generator | This platform |
|---|---|---|
| Agent readiness scoring | Rare | **Core** — 30 deterministic rules |
| Risk classification | Limited | **Core** — destructive operations never auto-enabled |
| Secret binding model | Variable | **Core** — references only, never literals |

**Topics:** `model-context-protocol` · `mcp` · `mcp-server` · `openapi` · `swagger` ·
`api-governance` · `ai-agents` · `typescript` · `openapi-to-mcp` · `agent-tools` · `llm-tools` ·
`api-security`

## Project status

**Pre-release.** Not yet published to npm; installing from source works fully today and is
covered by the Quickstart below. The compatibility contract is `mcp.config.json`'s
`schemaVersion` (currently `"1.0"`), not the CLI version — flag names and diagnostic codes may
still change in a `0.x` release.

Both authentication planes have been verified end to end against a real identity provider,
not only against in-repo fixtures — see [`examples/oauth-sandbox/`](examples/oauth-sandbox/).

> **Work in progress — upstream authentication configuration.** The auth planes themselves are
> implemented and verified; what is still hardening is how upstream auth is *configured*.
> `upstreamAuthentication.tokenUrl` is a plain string rather than an environment binding, and
> auth is project-level only — no per-tag or per-operation override (`FR-AUTH-UP-004`). Practical
> consequence today: one config cannot move between environments without editing `tokenUrl`.
> Both land before 1.0.

### Known limitations

Stated plainly, because finding these out by hitting them is worse:

- **Cancellation is not propagated.** `notifications/cancelled` does not yet abort an
  in-flight upstream call, so it runs to completion or timeout (`P1-W13-T01`).
- **OpenAPI 3.2 is not supported.** 2.0 and 3.0 are upgraded to 3.1 internally; 3.2 reports
  `IMP-001` (`P1-W03-T03`).
- **`upstreamAuthentication.tokenUrl` is a plain string, not a binding**, so unlike `issuer`
  and `resource` it cannot come from an environment variable — one config cannot move between
  environments without editing.
- **No per-tag or per-operation auth override.** `upstreamAuthentication` is project-level
  only (`FR-AUTH-UP-004`).
- **Oversized upstream responses are rejected, not paginated or projected** — half a JSON
  document is not a usable result (`UPS-003`).
- **No inbound request-body size cap** on the HTTP transport.
- **No config inheritance or schema migration.** `schemaVersion` is pinned at `"1.0"`; a
  future bump will come with instructions rather than an automatic upgrade.
- **Legacy MCP protocol eras are disabled by design**
  ([ADR-0009](docs/adr/0009-mcp-sdk-v2-and-modern-era.md)).
- **The web wizard has no authentication** — no accounts, no database, projects on a TTL. It
  is a local tool; do not expose it beyond localhost.
- **Single maintainer**, best-effort support.

## Quickstart

There are two ways to use `mcpgen`: the **web wizard** (guided, no JSON hand-authoring) or the
**CLI** (scriptable, installable from source today). Both
call the exact same engine and produce the exact same kind of output: a portable `mcp.config.json`
plus a generated, redistributable MCP server package.

### 1. Prerequisites

- Node.js ≥ 22.11 (`engines.node` in the root `package.json`)
- [pnpm](https://pnpm.io) 11.22 (`packageManager` in the root `package.json` — `corepack enable`
  will pick up the pinned version automatically)

### 2. Install and build

```bash
git clone https://github.com/nitin27may/mcp-generator.git
cd mcp-generator
pnpm install
pnpm build
```

### 3. Run the web wizard

```bash
pnpm --filter @mcpgen/web dev
```

Open `http://localhost:3000`. You land on a product page explaining what this is; `/docs` covers
both ways to use it (wizard and CLI) and `/projects/new/import` starts a project. Those two public
pages are responsive; the wizard itself is desktop-only by design (import → readiness → configure
→ generate), because curating a tool surface means reading operation tables beside their schemas.

### 4. Install the CLI from source

The CLI isn't on the npm registry yet, but it's fully usable straight from a clone:

```bash
cd apps/cli
npm link          # exposes a global `mcpgen` command backed by this build
cd ../..

mcpgen init     --spec fixtures/openapi-3.1/customer.json --enable-read-only
mcpgen validate --config mcp.config.json --spec fixtures/openapi-3.1/customer.json
mcpgen generate --config mcp.config.json --spec fixtures/openapi-3.1/customer.json --out ./dist-mcp
```

`init` derives a complete config from the spec — env var names, an auth block seeded from the
spec's own security scheme where one can be, every operation as a disabled tool — and prints
exactly which environment variables the result needs. Nothing is auto-enabled beyond what
`--enable-read-only`/`--enable <name>` asks for (BR-006: destructive and privileged operations are
never turned on for you). `validate` here will report two diagnostics — `BND-005`/`AUT-001`, an
unresolved base-URL environment variable and a missing upstream credential — because no real
deploy-time secret is set in this shell. That's expected: catching exactly that before `serve`
starts is what `validate` is for.

Commands: `init | serve | validate | print-tools | print-config | generate`. Every command but
`init` takes `--config`; every command but `print-config` also takes `--spec`. `serve` also takes
`--transport stdio|http` (default `stdio`), `--host`/
`--port` (`http` only — `--port 0` picks any available port), and `--dotenv <path>` (repeatable;
loads variables from a file without ever overriding one already set in the real environment — the
kind of environment an MCP client injects when it launches this server). `validate` also accepts
`--dotenv`. `generate` also takes `--out` (default `./dist-mcp`). `init` also takes `--out`
(default `./mcp.config.json`), `--name`/`--package-name`/`--bin-name`, `--transport`,
`--enable-read-only`, `--enable <tool-name>` (repeatable, exact names only — no globs), `--force`,
and `--json`. `--help`/`-h` and `mcpgen help <command>` print the full flag reference for any
command; `--version`/`-v` prints the CLI version.

Exit codes are consistent across every command: **0** success, **1** the operation ran but failed
(diagnostics were emitted — a missing secret, a validation error), **2** a usage error (an unknown
command or flag, an invalid flag value) — nothing was even attempted.

If `npm link` doesn't work out of the box, see
[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md#linking-the-cli-locally).

#### Authentication: env vars, resolved at run time — never configured at generation time

`init` derives environment variable names from the spec's own security scheme; the table below is
which ones exist for each type, and which of them are secrets:

| Scheme | Env vars `init` derives | Which are secrets |
|---|---|---|
| API key | `<SLUG>_API_KEY` | the key itself |
| Bearer token | `<SLUG>_TOKEN` | the token |
| Basic auth | `<SLUG>_USERNAME`, `<SLUG>_PASSWORD` | password only |
| OAuth2 client credentials | `<SLUG>_CLIENT_ID`, `<SLUG>_CLIENT_SECRET` | client secret only |

None of these are ever written into `mcp.config.json` as literal values — the config carries only
the variable *name* (ADR-0006). The credential itself is supplied however you launch the server:
export it in your shell, put it in a file and pass `--dotenv`, or — the normal case once you've
registered the server with an MCP client — let the client inject it via the `env` block of its own
launch config (see [What you get from Generate](#6-what-you-get-from-generate) below for the
client-configuration snippet). Generation-time and run-time are deliberately separate: you never
type a credential while curating the tool surface, only when you actually run the server.

### 5. Run with Docker Compose

```bash
docker compose up
```

Builds and runs the web wizard in a container — same app, same flow, nothing lighter or different
about it: import a spec, walk every step, generate, and download the `.zip`, all through
`http://localhost:3000`, backed by a named volume so projects survive a restart. If port 3000 is
already taken on your machine, override it: `WEB_PORT=3300 docker compose up`.

### 6. What you get from Generate

Whichever path you use, `generate` produces a `.zip` (web) or a directory (CLI) that is
**self-documenting** — it ships its own `README.md` covering required environment variables and
secrets, local `npx` setup, an MCP client-configuration JSON snippet, optional Docker instructions,
and troubleshooting. You don't need this repo's docs to run what it generates; open the generated
package's own README first.

### 7. Learn more

| Document | What it covers |
|---|---|
| [`docs/CONFIG.md`](docs/CONFIG.md) | Every field of `mcp.config.json` — the artifact this produces |
| [`docs/CLI.md`](docs/CLI.md) | All six commands, every flag, exit codes |
| [`docs/OAUTH.md`](docs/OAUTH.md) | Both authentication planes, end to end |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The 16 packages and the boundaries between them |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | What every diagnostic code means |
| [`examples/oauth-sandbox/`](examples/oauth-sandbox/) | A runnable stack: Keycloak, a protected API, the generated server |

In-app, once the wizard is running: `/` (what this is) and `/docs` (wizard walkthrough + CLI
reference side by side). [`docs/README.md`](docs/README.md) indexes the full engineering
record — requirements, technical plan, ADRs and the risk register.

## License

MIT — see [LICENSE](LICENSE).

The license applied to *generated* packages is a separate, user-facing choice; see
`GenerationConfig.license` in the technical plan.
