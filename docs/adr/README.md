# Architecture Decision Records

These are the decisions that constrain implementation. They exist as separate files, rather than as
[TIP §66](../TECHNICAL-PLAN.md#66-critical-design-decisions), so they can be cited in a code review
by name instead of by a section number inside a 93-section document.

**Five of the eight are mandatory.** A pull request that violates a mandatory ADR is rejected or must
amend the ADR — those are the only two options.

| ADR | Decision | Status | Enforced by |
|---|---|---|---|
| [0001](0001-portable-config-is-source-of-truth.md) | Portable configuration is the source of truth | Recommended | Determinism test, artifact manifest |
| [0002](0002-data-driven-runtime.md) | Generated runtime is data-driven, not per-operation bespoke code | Strongly recommended | Review rule, `generated-e2e` |
| [0003](0003-parser-types-never-escape-adapter.md) | OpenAPI parser types never escape the adapter package | **Mandatory** | `boundaries` script (CI, blocking) |
| [0004](0004-mcp-protocol-isolated-behind-adapter.md) | MCP protocol revisions isolated behind an adapter | **Mandatory** | `boundaries` script, protocol E2E |
| [0005](0005-separate-auth-planes.md) | Upstream auth and MCP auth are separate planes | **Mandatory** | Token-passthrough regression test |
| [0006](0006-secrets-are-references-only.md) | Secrets are references only | **Mandatory** | Type-level absence + `secret-leakage` suite |
| [0007](0007-deterministic-readiness-before-ai.md) | Readiness deterministic first, AI second | **Mandatory** | AI-disabled CI run, determinism test |
| [0008](0008-destructive-retry-disabled-by-default.md) | Destructive retry disabled by default | **Mandatory** | Unit tests on retry policy |
| [0009](0009-mcp-sdk-v2-and-modern-era.md) | Use MCP SDK v2 scoped packages via the modern-era factory path | **Mandatory** | Wire assertion on `server/discover`, lint ban on `connect()` |

## Superseded open questions

**OQ-01 — MCP protocol revision and SDK strategy.** Dissolved rather than resolved: the premise
(that the official SDK could not serve 2026-07-28) rested on inspecting the legacy
`@modelcontextprotocol/sdk` package. The v2 scoped packages serve the target revision. Recorded in
[ADR-0009](0009-mcp-sdk-v2-and-modern-era.md), with evidence in
[`../research/sdk-v2-api-notes.md`](../research/sdk-v2-api-notes.md).

## Format

Context → Decision → Consequences (positive **and** negative) → Enforcement.

The Enforcement section is not decoration. A decision with no mechanism behind it is a comment, and
comments do not survive contact with a deadline. If a new ADR cannot name a test, a lint rule, or a
script that upholds it, that is a signal the decision is not yet concrete enough to accept.
