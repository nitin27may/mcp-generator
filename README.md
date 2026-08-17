# mcp-generator

**An Agent Readiness and Governance Layer for APIs.**

Turn raw APIs into governed, agent-ready tool surfaces that are safe, optimized, testable, and
production-grade.

> Import OpenAPI. Configure once. Run MCP anywhere.

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

**Documentation baseline. Pre-implementation.** No product code exists yet by design — the
technical plan (§65) is explicit that the canonical model and runtime are built before any UI,
because a polished UI over a wrong domain model only hides architectural debt.

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
