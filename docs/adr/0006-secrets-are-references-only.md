# ADR-0006 — Secrets are references only

- **Status:** Accepted — **MANDATORY** (TIP §66 Decision 6)
- **Date:** 2026-08-17
- **Relates to:** TIP §11.2, §17.4, §36, §37, §60 · BRD FR-SEC-001…005, FR-BIND-003, BR-004

## Context

The portable config is designed to be committed to version control, shared between team members,
diffed in pull requests, and stored in a hosted control plane. Every one of those is a place a secret
must not be.

Making secret storage *possible but discouraged* does not work. If a `value` field exists on a secret
binding, it will be populated — by a user in a hurry, by an import path, or by a test fixture that
gets copied. The only reliable prevention is for the field not to exist.

## Decision

A secret is a **reference**. There is no representation of a secret value in any persisted artifact.

```typescript
interface SecretBinding {
  source: "secret";
  name: string;
  provider?: "environment" | "vault-reference";
  // No `value` field exists. This absence is the control.
}
```

Supporting rules:

- `StaticBinding` must **reject** `sensitive: true`. A sensitive static value is a secret binding
  by another name.
- `.env.example` may contain variable names and safe defaults, never real values, and never
  real-looking placeholders (TIP §74).
- Generated `.gitignore` excludes local secret files.
- Resolution happens at runtime through `SecretResolver` — `EnvironmentSecretProvider` at V1, cloud
  providers later. The portable config stays provider-agnostic; deployment decides the provider.
- CLI flags must not carry secret values: process argument lists are readable by other processes on
  the host (TIP §32).
- Redaction runs **before** persistence, logging, and telemetry emission — never after. It is driven
  by the binding graph (authoritative) plus sensitive-name matching (heuristic backstop), not by name
  heuristics alone.
- No secret reaches a span attribute, metric label, or log field (TIP §89.3).

## Consequences

**Positive.** The config is safe to commit, diff, and review, which is what makes governance
workflows possible. A leaked config exposes structure, not credentials. Cloud secret providers slot
in without a schema change. The invariant is checkable by machine.

**Negative.** The live playground cannot avoid handling a real credential in memory, so that path
needs its own explicit policy (FR-SEC-005, OQ-05) rather than inheriting this one. Users cannot store
a credential "just for testing", which is friction that will occasionally be reported as a bug.

## Enforcement

- `config-schema` type-level: `SecretBinding` has no `value`; `StaticBinding.sensitive` is typed
  `false`.
- Unit test: attempting a literal on a secret binding is rejected (`BND-003`).
- **`secret-leakage` suite** (TIP §86): run a tool call with a sentinel secret; assert the sentinel is
  absent from exported config, logs, traces, spans, and error messages. Blocking in CI.
- Secret scanning over fixtures in the PR pipeline (TIP §49).
- Task `P0-W11-T01` builds redaction in Phase 0 — before there is anything to leak — because
  retrofitted redaction is how secrets escape.
