# mcpgen

**An Agent Readiness and Governance Layer for APIs.**

> Import OpenAPI. Configure once. Run MCP anywhere.

`mcp-generator` sits between enterprise APIs and AI agents. It ingests an OpenAPI or Swagger
document, scores whether the API is actually *fit* for agent consumption, lets a human curate a safe
tool surface, and emits a **portable MCP definition** (`mcp.config.json`) — the durable artifact,
not generated source — that a shared runtime executes over stdio or Streamable HTTP.

Direct endpoint-to-tool conversion produces a weak production surface: too many tools, ambiguous
names, unsafe write and delete operations, secrets pasted into configuration. The question this
answers is not *"how do I convert this API to MCP?"* but **"which parts of our API ecosystem should
agents be allowed to use, and how should they safely use them?"**

```
OpenAPI / Swagger → Validation + Normalization → Agent Readiness Analysis → Governed Tool Design
                                                                                    ↓
                                                          Portable MCP Definition ← the product
                                                                                    ↓
                                                    stdio · Streamable HTTP · Docker · hosted (later)
```

!!! warning "Project status: pre-release"
    Not yet published to npm; installing from source works fully today. The compatibility contract
    is `mcp.config.json`'s `schemaVersion` (currently `"1.0"`), not the CLI version — flag names and
    diagnostic codes may still change in a `0.x` release. The [project README](https://github.com/nitin27may/mcp-generator/blob/main/README.md)
    lists the known limitations in full, stated plainly.

## What makes it different

| | Basic generator | This platform |
|---|---|---|
| Agent readiness scoring | Rare | **Core** — 30 deterministic rules |
| Risk classification | Limited | **Core** — destructive operations never auto-enabled |
| Secret binding model | Variable | **Core** — references only, never literals |

## Where to go next

| | |
|---|---|
| [CLI reference](CLI.md) | All six commands, every flag, exit codes, MCP client registration |
| [`mcp.config.json`](CONFIG.md) | Every field of the artifact this project produces |
| [Authentication](OAUTH.md) | Both authentication planes, end to end, with a runnable sandbox |
| [Architecture](ARCHITECTURE.md) | The 16 packages, the pipeline, and the boundaries that are actually enforced |
| [Design decisions](adr/index.md) | Ten ADRs — eight mandatory, each naming the test or lint rule that upholds it |
| [Troubleshooting](TROUBLESHOOTING.md) | Every diagnostic code, what it means, and what to do |
| [Contributing](CONTRIBUTING.md) | Building from source, local dev setup, linking the CLI locally |

## Protocol strategy

Target revision: **MCP 2026-07-28** — stateless, POST-only Streamable HTTP, no protocol sessions.
The v2 scoped SDK packages (`@modelcontextprotocol/{core,server,client}@2.0.0`, not the legacy
`@modelcontextprotocol/sdk`) are used via the modern factory path — `serveStdio(factory)`, never
`McpServer#connect()`, which silently serves the legacy protocol era. Decision:
[ADR-0009](adr/0009-mcp-sdk-v2-and-modern-era.md).
