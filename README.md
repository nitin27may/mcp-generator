# mcp-generator

**An Agent Readiness and Governance Layer for APIs.**

> Import OpenAPI. Configure once. Run MCP anywhere.

[![MCP](https://img.shields.io/badge/MCP-2026--07--28-0f766e)](docs/adr/0009-mcp-sdk-v2-and-modern-era.md)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-2.0%20%7C%203.0%20%7C%203.1%20%7C%203.2-c2410c)](docs/BRD.md#102-openapi-import)
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

## Quickstart

There are two ways to use `mcpgen`: the **web wizard** (guided, no JSON hand-authoring) or the
**CLI** (scriptable, npm-installable from source today — not yet published to the registry). Both
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

mcpgen print-tools --config fixtures/openapi-3.1/customer.mcp.config.json \
                    --spec   fixtures/openapi-3.1/customer.json
mcpgen generate     --config fixtures/openapi-3.1/customer.mcp.config.json \
                    --spec   fixtures/openapi-3.1/customer.json \
                    --out    ./dist-mcp
```

(`mcpgen validate` against this same fixture will report two diagnostics — `BND-005`/`AUT-001`,
an unresolved base-URL environment variable and a missing upstream credential. That's expected:
the fixture references real deploy-time secrets on purpose, and catching exactly that is what
`validate` is for.)

Commands: `serve | validate | print-tools | print-config | generate`. Every command takes
`--config`; every command but `print-config` also takes `--spec`. `serve` also takes
`--transport stdio|http` (default `stdio`), `--host`/
`--port` (`http` only — `--port 0` picks any available port), and `--dotenv <path>` (repeatable;
loads variables from a file without ever overriding one already set in the real environment — the
kind of environment an MCP client injects when it launches this server). `validate` also accepts
`--dotenv`. `generate` also takes `--out` (default `./dist-mcp`). `--help`/`-h` and `mcpgen help
<command>` print the full flag reference for any command; `--version`/`-v` prints the CLI version.

Exit codes are consistent across every command: **0** success, **1** the operation ran but failed
(diagnostics were emitted — a missing secret, a validation error), **2** a usage error (an unknown
command or flag, an invalid flag value) — nothing was even attempted.

If `npm link` doesn't work out of the box, see
[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md#linking-the-cli-locally).

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

- In-app, once the wizard is running: `/` (what this is) and `/docs` (wizard walkthrough + CLI
  reference side by side).
- [`docs/README.md`](docs/README.md) for the full architecture, requirements, and ADRs.

## License

MIT — see [LICENSE](LICENSE).

The license applied to *generated* packages is a separate, user-facing choice; see
`GenerationConfig.license` in the technical plan.
