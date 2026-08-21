# Technical Risk Register

Companion to [TECHNICAL-PLAN.md §78](TECHNICAL-PLAN.md#78-technical-risks-register) and
[BRD §24](BRD.md#24-risks-and-mitigations). This file carries owners, current status, and the trigger
that would tell us the risk is materializing.

**Last reviewed:** 2026-08-17
**Review cadence:** at each phase gate, and immediately on any MCP revision announcement.

Impact scale: **Low · Medium · High · Critical**
Status: `open` · `mitigating` · `realized` · `accepted` · `closed`

---

## Active risks

### R12 — MCP SDK does not support the target protocol revision — **CLOSED**

| Field | Value |
|---|---|
| Probability | n/a |
| Impact | n/a |
| Owner | Architecture |
| Status | `closed` 2026-08-17 — **the premise was false** |

**Closed because the risk did not exist.** The original finding inspected
`@modelcontextprotocol/sdk@1.30.0` and read `LATEST_PROTOCOL_VERSION = '2025-11-25'`. That is the
**legacy** distribution. The current SDK is the v2 scoped set
`@modelcontextprotocol/{core,server,client}@2.0.0`, which serves 2026-07-28. Confirmed on the raw
JSON-RPC wire: `server/discover` → `supportedVersions: ["2026-07-28"]`.

See [ADR-0009](adr/0009-mcp-sdk-v2-and-modern-era.md) and
[`research/sdk-v2-api-notes.md`](research/sdk-v2-api-notes.md).

**Lesson retained, and it is the reason this entry stays in the register rather than being deleted:**
a version constant read from the wrong package produced a wrong architectural conclusion, an invented
blocker, and 10–18 dev-days of unnecessary planned work. Verify against the running artifact, not a
constant and not a README. That practice is now Part A of the P0 plan and §11 of the research notes.

---

### R21 — Silent protocol-era downgrade

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | **High** |
| Owner | Architecture |
| Status | `mitigating` |

The same `McpServer` serves a **different protocol era** depending on which entry point starts it,
with nothing in the type signature to warn you:

- `new McpServer(info).connect(new StdioServerTransport())` → **legacy**; answers `initialize` with
  `2025-11-25`, returns `-32601` for `server/discover`.
- `serveStdio(factory)` → **modern**; `server/discover` returns `supportedVersions: ["2026-07-28"]`.

The legacy path works, passes naive tests, and ships the wrong revision. `LATEST_PROTOCOL_VERSION`
actively misleads, since it reports the legacy ceiling even when the server is correct.

**Mitigation.** ADR-0009 mandates the factory path. Enforced by a wire-level E2E assertion on
`server/discover` (`P0-W07-T02`) — not a constant comparison, which would fail while the server is
correct — plus a lint ban on `McpServer#connect(` outside deliberate legacy fixtures.

**Trigger.** Any SDK release that changes the entry points; any E2E era-assertion failure.

---

### R3 — MCP protocol changes

| Field | Value |
|---|---|
| Probability | High |
| Impact | High |
| Owner | Architecture |
| Status | `mitigating` |

The protocol is evolving rapidly and not additively. R12 is one instance; there will be others.

**Mitigation.** Versioned protocol adapter (ADR-0004). Generated artifacts record their protocol
target (TIP §39). Explicit compatibility matrix (TIP §27). Standards baseline re-reviewed every 8
weeks (TIP §2).

**Trigger.** Any revision announcement, or a spec page changing under an existing revision URL.

---

### R2 / R7 — Schema conversion mismatch

| Field | Value |
|---|---|
| Probability | High |
| Impact | High |
| Owner | Engineering |
| Status | `open` |

OpenAPI 3.0 schemas are not JSON Schema 2020-12. Swagger 2 differs further. Copying schemas and
assuming equivalent semantics produces tool schemas that validate wrongly — accepting bad input or
rejecting good input, both silently.

**Mitigation.** Dedicated canonical schema layer with source-dialect-aware adapters and recorded
warnings (TIP §10). Golden tests across all four families. `SchemaBudget` warnings instead of silent
truncation. XL effort budgeted (10–18 dev-days, `P1-W04-T01`).

**Trigger.** Corpus import success rate below 95%, or any golden snapshot change that cannot be
explained.

---

### R5 — SSRF through URL import or `$ref` resolution

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | **Critical** |
| Owner | Security |
| Status | `open` |

Remote spec import and external `$ref` resolution both fetch attacker-influenced URLs from inside our
network. Cloud metadata endpoints are the classic target.

**Mitigation.** Dedicated safe-fetch layer (`reference-resolver`, `P1-W18-T01`) with scheme allowlist,
private/link-local/loopback/metadata blocking, per-hop DNS revalidation, and byte/depth/count caps.
Security suite includes a DNS-rebinding simulation. The local CLI may relax file-reference rules; the
SaaS may not (TIP §9.3). The same controls apply to the playground's base URL (TIP §35.2).

**Trigger.** Any egress from the control plane to a non-public address in logs.

---

### R6 — Secret leakage

| Field | Value |
|---|---|
| Probability | Low/Medium |
| Impact | **Critical** |
| Owner | Security |
| Status | `mitigating` |

Config is designed to be committed and shared. Logs, traces, spans, analytics, and error messages all
touch bound values.

**Mitigation.** [ADR-0006](adr/0006-secrets-are-references-only.md) — no `value` field exists on a
secret binding, so there is nothing to leak from the config. Redaction built in P0
(`P0-W11-T01`) before there is anything to leak. `secret-leakage` suite asserts a sentinel secret is
absent from every output channel. Secret scanning over fixtures in CI.

**Trigger.** Any secret-leakage test failure — treat as a P1 incident, not a flaky test.

---

### R11 — Confused deputy / token passthrough

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | **Critical** |
| Owner | Security |
| Status | `mitigating` |

Forwarding the inbound MCP token upstream is the convenient implementation and a specification
**MUST NOT**.

**Mitigation.** [ADR-0005](adr/0005-separate-auth-planes.md). `upstream-auth` cannot import
`mcp-protocol`, enforced by the `boundaries` script. Permanent token-passthrough regression test in
the `security` suite — `packages/test-fixtures/test/security/token-passthrough.test.ts`, running
both planes against the real CLI binary. Error code `SEC-006` makes a blocked attempt legible,
emitted by `checkAccessPosture` in `packages/mcp-runtime/src/access.ts`.

The audience half of this risk is now closed too: `P6-W23-E01` landed Plane A, so an inbound token
minted for a different resource server is rejected rather than accepted, and
`packages/test-fixtures/test/security/mcp-access.test.ts` covers that path along with expiry,
signature and issuer rejection. Status stays `mitigating` rather than `closed` because the risk
re-opens the moment Plane B gains RFC 8693 token exchange, which is when the planes first touch.

**Trigger.** Any proposal to "simplify" auth configuration by reusing the inbound token.

---

### R8 — Tool overload / large surfaces

| Field | Value |
|---|---|
| Probability | High |
| Impact | High |
| Owner | Product |
| Status | `open` |

A 1,000-operation API converted 1:1 produces an unusable tool surface, and the UI for curating it
becomes unusable too.

**Mitigation.** Readiness-driven reduction (TIP §16). Grouping, filters, bulk actions, readiness
sorting. Soft warning above 1,000 operations (TIP §56). Tool reduction ratio is *reported*, not
targeted — a target would create pressure to over-prune (BRD §32).

**Trigger.** Any real-world spec where the wizard takes more than a few minutes per step.

---

### R1 — Commodity perception

| Field | Value |
|---|---|
| Probability | High |
| Impact | High |
| Owner | Product |
| Status | `mitigating` |

Conversion is easy to reproduce. If the product is read as "another Swagger-to-MCP generator", the
category is worthless.

**Mitigation.** Lead with readiness and governance (BRD §4.1 lists the positioning to avoid
explicitly). Phase 3 is when the product stops looking like a converter — which is also an argument
for not slipping it.

**Trigger.** Inbound descriptions of the product as a converter.

---

### R9 — Generated package drift

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | High |
| Owner | Engineering |
| Status | `mitigating` |

Thousands of bespoke generated files across many customer projects cannot be security-patched.

**Mitigation.** [ADR-0002](adr/0002-data-driven-runtime.md) — shared runtime dependency plus a thin
manifest. A runtime fix is a version bump. Compatibility policy for the runtime becomes a product
commitment (TIP §90.5).

**Trigger.** Any pull request emitting per-operation HTTP logic.

---

### R10 — Reconciliation mismatch

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | High |
| Owner | Engineering |
| Status | `open` |

Auto-mapping a renamed operation to the wrong one silently transfers a tool's configuration —
including its risk classification — to a different endpoint.

**Mitigation.** Stable operation identity with source and semantic fingerprints (TIP §7,
`P1-W02-T01`). Ambiguous renames are **never** auto-mapped; the user chooses (FR-REC-002). Removed
operations become orphaned, not deleted. Reconciliation is previewed before it is applied.

**Trigger.** Any reconciliation that changes a tool's `sourceOperation` without user confirmation.

---

### R4 — Parser dependency lock-in

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | Medium |
| Owner | Engineering |
| Status | `mitigating` |

**Mitigation.** [ADR-0003](adr/0003-parser-types-never-escape-adapter.md), enforced by the
`boundaries` script. `@scalar/openapi-parser` 0.28.14 verified to ship all four OAS families, so the
immediate need is met; replaceability is preserved regardless.

**Trigger.** Parser gaps found by the corpus suite; parser abandonment.

---

### R13 — OAS 3.2 ecosystem gaps

| Field | Value |
|---|---|
| Probability | Medium |
| Impact | Medium |
| Owner | Engineering |
| Status | `open` |

3.2.0 was finalized 2025-09-19; tooling support is newer than for 3.0/3.1.

**Mitigation.** Version adapter per family; fixture corpus includes `simple-pets-oas32`; Redocly and
`swagger2openapi` held as fallbacks for specific constructs.

---

### R14 — OAuth complexity

| Field | Value |
|---|---|
| Probability | High |
| Impact | High |
| Owner | Architecture |
| Status | `accepted` — deferred |

Client credentials need token cache, expiry, clock skew, and an acquire lock (L/XL). User-delegated
OAuth is XL and interacts with MCP authorization rules.

**Mitigation.** Deliberately postponed: API key, bearer, and basic at V1; client credentials at V1.5
(`P5-W10-E01`); user-delegated treated as a separate feature, not MVP.

---

### R15 — SaaS cannot reach internal APIs

| Field | Value |
|---|---|
| Probability | High |
| Impact | Medium |
| Owner | Product |
| Status | `accepted` |

The customers who most want governance have APIs the hosted playground cannot reach — and SSRF
protections (R5) are precisely what stop it.

**Mitigation.** Local CLI works fully offline against internal APIs. Local-first browser processing
(TIP §52). Enterprise private agents later. This tension is inherent, not a bug: the fix for R5 is the
cause of R15.

---

### R16 — Poor source documentation limits output quality

| Field | Value |
|---|---|
| Probability | High |
| Impact | High |
| Owner | Product |
| Status | `mitigating` |

Most OpenAPI documents have thin descriptions. Tool quality is bounded by input quality.

**Mitigation.** This is reframed as the product's value rather than its limitation — readiness
findings name the gap and offer remediation, with optional AI suggestions. `ARA-DOC-001…007` cover
seven documentation defects.

---

## Accepted, monitoring only

| ID | Risk | Why accepted |
|---|---|---|
| R17 | Hosted MCP tenancy complexity (XL) | Deferred to P6; per-deployment container chosen first (OQ-04) to avoid it |
| R18 | AI evaluation difficulty — easy to call a model, hard to know if suggestions are good | Deterministic core means AI quality is never load-bearing (ADR-0007); acceptance-rate metric provides evidence |
| R19 | Enterprise governance scope is open-ended | Explicitly V3+ and out of MVP scope (BRD §36) |

---

## Risks retired in v1.1

None. This is the register's first version with owners; nothing has been closed yet.
