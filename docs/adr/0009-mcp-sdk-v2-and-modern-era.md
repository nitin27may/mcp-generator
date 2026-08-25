# ADR-0009 — Use MCP SDK v2 scoped packages via the modern-era factory path

- **Status:** Accepted — **MANDATORY** (protocol correctness)
- **Date:** 2026-08-17
- **Supersedes:** the open question OQ-01, which is dissolved rather than resolved
- **Relates to:** [ADR-0004](0004-mcp-protocol-isolated-behind-adapter.md) · TIP §2, §24, §25, §26, §27, §92
- **Evidence:** [`docs/research/sdk-v2-api-notes.md`](https://github.com/nitin27may/mcp-generator/blob/main/docs/research/sdk-v2-api-notes.md) — verified 2026-08-17

## Context

The architecture targets MCP revision **2026-07-28**. An earlier pass inspected
`@modelcontextprotocol/sdk@1.30.0`, found `LATEST_PROTOCOL_VERSION = '2025-11-25'`, and concluded the
official SDK could not speak the target revision — filed as a P0 blocker.

**That conclusion was wrong, and for an instructive reason.** There are two distributions:

| Package | Latest | Status |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | Legacy single package, capped at 2025-11-25 |
| `@modelcontextprotocol/{core,server,client}` | 2.0.0, 2026-07-27 | Current split packages, implement 2026-07-28 |

Empirical probing of the v2 packages then surfaced a second, sharper fact. `LATEST_PROTOCOL_VERSION`
is still `"2025-11-25"` in v2 — because it names the latest **legacy-era** version, not the SDK's
capability ceiling. The SDK models two eras (`type ProtocolEra = 'legacy' | 'modern'`) and carries
`MODERN_WIRE_REVISION = "2026-07-28"` internally, unexported.

Which era you get depends on **how you start the server**, and nothing in the type signature warns
you:

```js
// LEGACY: answers initialize with 2025-11-25; server/discover → -32601
await new McpServer(info).connect(new StdioServerTransport());

// MODERN: server/discover → supportedVersions: ["2026-07-28"]
serveStdio(() => { const s = new McpServer(info); s.registerTool(...); return s; });
```

Both were confirmed on the raw JSON-RPC wire. This is a silent-downgrade hazard: the legacy path
works, passes tests, and serves the wrong protocol revision.

## Decision

1. **Use the v2 scoped packages** — `@modelcontextprotocol/core`, `/server`, `/client`. The legacy
   `@modelcontextprotocol/sdk` package is not a dependency of this project.
2. **Start servers through the modern factory path only.** `serveStdio(factory)` for stdio;
   `PerRequestHTTPServerTransport` / `createMcpHandler` for HTTP. `McpServer#connect()` is legacy and
   must not appear in shipped code.
3. **The factory returns a fresh `McpServer` per invocation**, matching the modern era's
   statelessness. No server instance is held across requests.
4. **Register tool schemas as raw JSON Schema via `fromJsonSchema`**, never as authored Zod. Our
   schemas are generated; `schema-normalizer` emits JSON Schema 2020-12 and the SDK publishes it
   verbatim.
5. **Do not reimplement what the SDK owns.** §8 of the research notes enumerates the boundary: input
   validation, Origin/Host validation, era classification, MRTR primitives, `_meta` keys,
   subscriptions, Tasks, bearer auth, and protocol error types are the SDK's. Upstream HTTP execution,
   binding, retry, response limits, and `x-mcp-header` constraint validation are ours.
6. **Track the latest SDK.** Protocol revision adoption follows SDK releases; we do not fork or
   reimplement transports.

## Consequences

**Positive.** The target revision is available today, so no in-house transport work is needed — TIP
§63's conditional 10–18 dev-day row is void and the MVP band stays 100–150. `FR-BIND-007`,
`FR-HTTP-MCP-006` and `FR-POL-005` are implementable now and remain MVP/MUST. Several planned
responsibilities are *removed* rather than added: the SDK validates tool input and performs Origin
validation, so `mcp-runtime` begins after arguments are already valid. Risk R12 closes.

**Negative.** We depend on an undocumented-by-signature distinction between two entry points; a
future SDK refactor could move it, and nothing but a test would tell us. `LATEST_PROTOCOL_VERSION`
remains actively misleading, so any newcomer reading it will draw the wrong conclusion — which is why
the enforcement below is a wire assertion rather than a constant comparison. Tracking the latest SDK
means adopting its cadence, including major bumps on someone else's schedule.

## Enforcement

- **Era assertion test (mandatory).** An E2E test drives `server/discover` against the spawned server
  and asserts `supportedVersions` contains `2026-07-28`. This is the only reliable era check —
  comparing against `LATEST_PROTOCOL_VERSION` would fail while the server is correct.
- **Lint ban.** `McpServer#connect(` is a restricted-syntax error outside test fixtures that
  deliberately exercise the legacy path.
- **Boundary.** `boundaries` script: only `mcp-protocol` may import `@modelcontextprotocol/*`
  (ADR-0004). `@modelcontextprotocol/client` is a devDependency of the E2E suite only, never a runtime
  dependency of a generated server.
- **Dependency pin.** Exact versions in `package.json`; SDK updates are planned work items, and each
  one re-runs the reproduction steps in the research notes.
- **Generated README** states the actual negotiated revision, taken from the wire, not from a constant.
