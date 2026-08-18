# Documentation index

The root [`README.md`](../README.md) covers installing and using `mcpgen`. Everything here is the
engineering record behind it — requirements, architecture, and the decisions that constrain
implementation.

| Document | Purpose |
|---|---|
| [BRD.md](BRD.md) | Business Requirements Document — personas, requirements (`FR-*`, `BR-*`), scope by release, success metrics |
| [TECHNICAL-PLAN.md](TECHNICAL-PLAN.md) | Technical Implementation Plan — architecture, standards baseline, work breakdown structure, phase gates |
| [adr/](adr/) | Architecture Decision Records — the decisions that constrain all implementation |
| [RISKS.md](RISKS.md) | Technical risk register with owners and mitigation status |
| [research/](research/) | Empirical findings. `sdk-v2-api-notes.md` is the source of truth for MCP SDK usage — it outranks vendor docs, because it records what actually ran |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Building from source, local dev setup, linking the CLI locally |

Start with the [WBS in the technical plan](TECHNICAL-PLAN.md#83-work-breakdown-structure) — it is
the tracking artifact, and every task there maps back to a requirement and forward to a test.

## Protocol strategy

Target revision: **MCP 2026-07-28** — stateless, POST-only Streamable HTTP, no protocol sessions.
We use the v2 scoped SDK packages (`@modelcontextprotocol/{core,server,client}@2.0.0`, not the
legacy `@modelcontextprotocol/sdk`) via the modern factory path (`serveStdio(factory)`, never
`McpServer#connect()`, which silently serves the legacy protocol era). Decision:
[ADR-0009](adr/0009-mcp-sdk-v2-and-modern-era.md). Evidence:
[research/sdk-v2-api-notes.md](research/sdk-v2-api-notes.md).
