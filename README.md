# mcp-generator

**An Agent Readiness and Governance Layer for APIs.**

Turn raw APIs into governed, agent-ready tool surfaces that are safe, optimized, testable, and
production-grade.

> Import OpenAPI. Configure once. Run MCP anywhere.

[![Status](https://img.shields.io/badge/status-implemented-15803d)](docs/TECHNICAL-PLAN.md#83-work-breakdown-structure)
[![MCP](https://img.shields.io/badge/MCP-2026--07--28-0f766e)](docs/adr/0009-mcp-sdk-v2-and-modern-era.md)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-2.0%20%7C%203.0%20%7C%203.1%20%7C%203.2-c2410c)](docs/BRD.md#102-openapi-import)
[![Node](https://img.shields.io/badge/node-22%20LTS-15803d)](docs/TECHNICAL-PLAN.md#3-technology-stack--pinned)
[![License](https://img.shields.io/badge/license-MIT-64748b)](LICENSE)

## About

`mcp-generator` sits between enterprise APIs and AI agents. It ingests an OpenAPI/Swagger document,
analyzes whether the API is actually *fit* for agent consumption, lets a human curate a safe tool
surface, and emits a **portable MCP definition** (`mcp.config.json`) that a shared runtime executes
over stdio or Streamable HTTP.

The strategic question it answers is not "how do I convert this API to MCP?" but:

> Which parts of our API ecosystem should agents be allowed to use, and how should they safely use
> them?

**Topics:** `model-context-protocol` · `mcp` · `mcp-server` · `openapi` · `swagger` ·
`api-governance` · `ai-agents` · `typescript` · `openapi-to-mcp` · `agent-tools` · `llm-tools` ·
`api-security`

### What makes it not just a converter

| | Basic generator | This platform |
|---|---|---|
| Endpoint→tool conversion | Yes | Yes |
| Agent readiness scoring | Rare | **Core** — 30 deterministic rules |
| Risk classification | Limited | **Core** — destructive ops never auto-enabled |
| Secret binding model | Variable | **Core** — references only, never literals |
| Portable governance manifest | Rare | **Core** — the durable artifact |
| API change reconciliation | Rare | Strategic |
| Governance lifecycle | No | Strategic |

## What this is

Organizations already have large investments in REST APIs described through Swagger/OpenAPI. AI
agents can technically call those APIs once they are exposed as tools, but direct
endpoint-to-tool conversion produces a weak production surface: too many tools, ambiguous names,
poor descriptions, unsafe write and delete operations, secrets in configuration, and no visibility
into what agents can actually invoke.

This platform ingests OpenAPI/Swagger, analyzes agent readiness, lets a human curate a safe MCP
tool surface, and produces a **portable MCP definition** (`mcp.config.json`) that can be executed
over stdio or Streamable HTTP.

The durable artifact is the configuration, not generated source:

```
OpenAPI / Swagger
        ↓
Validation + Normalization
        ↓
Agent Readiness Analysis
        ↓
Governed Tool Design
        ↓
Portable MCP Definition          ← the product
        ↓
stdio · Streamable HTTP · Docker · hosted (later)
```

## Status

**Implemented and tested.** The canonical model, readiness/risk engines, MCP runtime, package
generator, CLI, and the guided web wizard are all built — 17 packages, 550+ tests. See
[`docs/TECHNICAL-PLAN.md`'s WBS](docs/TECHNICAL-PLAN.md#83-work-breakdown-structure) for exactly
what's done versus outstanding, and the [reconciliation log (§93)](docs/TECHNICAL-PLAN.md) for
every gap found and fixed along the way.

## Quickstart

There are two ways to use `mcpgen`: the **web wizard** (guided, no JSON hand-authoring) or the
**CLI** (scriptable, npm-installable from source today — not yet published to the registry).
Both call the exact same engine and produce the exact same kind of output: a portable
`mcp.config.json` plus a generated, redistributable MCP server package.

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

Open `http://localhost:3000`. The wizard is desktop-only by design (import → readiness → configure
→ generate); everything it needs is documented in-app at `/docs` once you land there. Projects are
stored under an ephemeral, disk-backed workspace (`MCPGEN_WORKSPACE_ROOT`, default
`$TMPDIR/mcpgen-workspace`) — no accounts, no database. The full environment variable list (project
TTLs, upload/build size caps, the private-egress opt-in used for local playground testing) is in
[`apps/web/src/server/env.ts`](apps/web/src/server/env.ts).

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

Commands: `serve | validate | print-tools | print-config | generate`. Flags: `--config`, `--spec`,
`--transport stdio|http` (`serve` only, defaults to `stdio`), `--host`/`--port` (`http` only),
`--out` (`generate` only, defaults to `./dist-mcp`).

If `npm link` fails with a permissions error (some systems' global npm prefix isn't
user-writable), either fix npm's global prefix or run it scoped to a writable one:
`npm_config_prefix=$HOME/.npm-global npm link` (and add `$HOME/.npm-global/bin` to `PATH`).

### 5. Run with Docker Compose

```bash
docker compose up
```

Builds and runs the web wizard in a container — same app, same flow, nothing lighter or different
about it. Open `http://localhost:3000` and use it exactly as in step 3.

### 6. What you get from Generate

Whichever path you use, `generate` produces a `.zip` (web) or a directory (CLI) that is
**self-documenting** — it ships its own `README.md` covering required environment variables and
secrets, local `npx` setup, an MCP client-configuration JSON snippet, optional Docker instructions,
and troubleshooting. You don't need this repo's docs to run what it generates; open the generated
package's own README first.

### 7. Learn more

- In-app, once the wizard is running: `/` (what this is) and `/docs` (wizard walkthrough + CLI
  reference side by side).
- [`docs/BRD.md`](docs/BRD.md) and [`docs/TECHNICAL-PLAN.md`](docs/TECHNICAL-PLAN.md) for the full
  architecture and requirements.

## Documents

| Document | Purpose |
|---|---|
| [docs/BRD.md](docs/BRD.md) | Business Requirements Document — personas, requirements (`FR-*`, `BR-*`), scope by release, success metrics |
| [docs/TECHNICAL-PLAN.md](docs/TECHNICAL-PLAN.md) | Technical Implementation Plan — architecture, standards baseline, work breakdown structure, phase gates |
| [docs/adr/](docs/adr/) | Architecture Decision Records — the nine decisions that constrain all implementation |
| [docs/RISKS.md](docs/RISKS.md) | Technical risk register with owners and mitigation status |
| [docs/research/](docs/research/) | Empirical findings. `sdk-v2-api-notes.md` is the source of truth for SDK usage — it outranks vendor docs, because it records what actually ran |

Start with the [WBS in the technical plan](docs/TECHNICAL-PLAN.md#83-work-breakdown-structure) —
it is the tracking artifact, and every task there maps back to a requirement and forward to a test.

## Protocol strategy

Target revision: **MCP 2026-07-28** — stateless, POST-only Streamable HTTP, no protocol sessions.

We use the **v2 scoped SDK packages** and start servers through the modern factory path:

```js
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

serveStdio(() => { /* build and return a fresh McpServer */ });
```

Two traps, both verified on the wire and both easy to fall into:

1. **`@modelcontextprotocol/sdk` is the legacy package**, capped at protocol 2025-11-25. Depend on
   `@modelcontextprotocol/{core,server,client}@2.0.0` instead.
2. **`McpServer#connect()` silently serves the legacy era.** Only `serveStdio(factory)` reports
   `supportedVersions: ["2026-07-28"]`. `LATEST_PROTOCOL_VERSION` is the *legacy* ceiling and will
   mislead you — assert the era from `server/discover`, never from that constant.

Decision: [ADR-0009](docs/adr/0009-mcp-sdk-v2-and-modern-era.md).
Evidence: [`docs/research/sdk-v2-api-notes.md`](docs/research/sdk-v2-api-notes.md).
This is also why [ADR-0004](docs/adr/0004-mcp-protocol-isolated-behind-adapter.md) is mandatory rather
than merely tidy — it kept a wrong premise contained to one package.

## License

MIT — see [LICENSE](LICENSE).

The license applied to *generated* packages is a separate, user-facing choice; see
`GenerationConfig.license` in the technical plan.
