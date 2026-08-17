# ADR-0004 — MCP protocol revisions are isolated behind an adapter

- **Status:** Accepted — **MANDATORY** (TIP §66 Decision 4)
- **Date:** 2026-08-17
- **Relates to:** TIP §2.1, §24, §26, §27, §92 · BRD FR-HTTP-MCP-002, §24 R3
- **Evidence this is load-bearing:** TIP §2.1 — the protocol-era hazard, and the contained false alarm

## Context

MCP is evolving quickly, and the changes are not additive. Between revision 2025-11-25 and
2026-07-28 the protocol removed the `initialize` handshake, removed `Mcp-Session-Id` sessions,
removed the GET SSE stream, removed `Last-Event-ID` resumability, stopped allowing server-initiated
JSON-RPC requests in favour of MRTR `InputRequiredResult`, added mandatory request-metadata headers
with body-mirroring validation, and replaced discovery with `server/discover`.

Any of those assumptions, if scattered across the runtime, the generator, and the emitted templates,
becomes a rewrite when the protocol moves.

**This is not hypothetical, and it bit twice on day one** — verified 2026-08-17, before any code
existed:

1. **A live era hazard.** The same `McpServer` serves a *different protocol era* depending on which
   entry point starts it. `connect()` yields legacy 2025-11-25; `serveStdio(factory)` yields
   2026-07-28. Nothing in the type signature distinguishes them, and `LATEST_PROTOCOL_VERSION`
   reports the legacy ceiling even when the server is correct. A protocol assumption spread across
   the runtime and the generator would embed this silently. See TIP §2.1 and risk R21.

2. **A contained wrong premise.** An earlier pass inspected the wrong package — the legacy
   `@modelcontextprotocol/sdk` rather than the v2 scoped set — and concluded the target revision was
   unsupported. That produced an invented blocker and 10–18 dev-days of planned in-house transport
   work. Because protocol knowledge was already confined to `mcp-protocol`, correcting it touched one
   ADR and one package boundary instead of the generator, the runtime, and every emitted template.

The second case is the stronger argument for this ADR. Isolation protects you not only when the
protocol changes, but when *you are wrong about the protocol* — which is more frequent.

## Decision

All MCP protocol-specific behaviour is confined to `mcp-protocol`, behind a versioned adapter:

```text
Application / tool runtime
        ↓
McpProtocolAdapter
        ↓
Official MCP SDK / in-house protocol implementation
```

`mcp-protocol` is the **only** package permitted to import `@modelcontextprotocol/*`. It owns:

- tool registration and protocol-specific schema representation,
- tool result formatting,
- transport startup (stdio, Streamable HTTP),
- version negotiation and the compatibility matrix (TIP §27),
- request-metadata header validation (TIP §92.2),
- MRTR input-request round trips (TIP §92.3),
- cancellation normalization across transports into one `AbortSignal` (TIP §92.4),
- protocol error mapping.

Nothing above the adapter references a protocol revision, a header name, or an SDK type.

The revision/SDK strategy itself is a separate decision, tracked as **BRD OQ-01** and to be recorded
as ADR-0009 before task `P0-W07-T01`. That this can be a *contained* decision at all is the point of
this ADR.

## Consequences

**Positive.** The SDK gap in TIP §2.1 is a scoped choice with three costed options, not a
project-wide problem. The domain model, binding engine, executor, readiness engine, and generator
are all protocol-agnostic and testable without a protocol. Supporting two revisions simultaneously
(option C) means two adapter implementations, not two products. Generated artifacts can record their
actual protocol target (TIP §39) honestly.

**Negative.** An indirection layer that must be maintained, and it can leak if someone adds a
protocol-shaped field to the runtime model for convenience. Features that are genuinely
protocol-specific — `x-mcp-header` mirroring, MRTR confirmation — need deliberate representation in
the config schema rather than direct SDK use, which is more work than calling the SDK inline.

## Enforcement

- `boundaries` script (TIP §91.2): only `mcp-protocol` may list or import `@modelcontextprotocol/*`.
  Blocking in CI.
- `mcp-runtime` depends on `mcp-protocol` through the `McpProtocolAdapter` interface only.
- The generated README must state the **actual** implemented revision, not the aspirational one
  (TIP §27).
- Protocol E2E suites (`protocol-stdio`, `protocol-http`) drive a real MCP client, so adapter
  correctness is tested against the protocol rather than against our own mock.
