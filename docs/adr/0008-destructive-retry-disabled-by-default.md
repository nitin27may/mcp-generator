# ADR-0008 — Destructive retry is disabled by default

- **Status:** Accepted — **MANDATORY** safe default (TIP §66 Decision 8)
- **Date:** 2026-08-17
- **Relates to:** TIP §15, §21, §22 · BRD FR-POL-003, FR-POL-004, FR-RISK-004, BR-006, G2

## Context

Retrying a failed HTTP request is standard resilience engineering, and most HTTP client libraries
retry by default or make it a one-line opt-in.

For an agent-facing tool surface that default is wrong. A `POST /orders` that times out may well have
succeeded upstream — the response was lost, not the operation. Retrying creates a duplicate order. A
`DELETE` that returns 502 may have deleted the resource. `PATCH` is rarely idempotent in practice
regardless of what the specification says.

The risk is amplified by the caller being an LLM. An agent that receives an error will often retry at
its own level too, so a client-side retry policy multiplies rather than adds. And the blast radius is
the customer's production data, not ours.

## Decision

Retry defaults are set by method, biased toward *not* repeating a possibly-applied side effect.

| Method | Retry default |
|---|---|
| GET | Retry transient failures |
| HEAD | Retry |
| PUT | Conservative — only if explicitly configured or declared idempotent |
| DELETE | **Disabled** |
| POST | **Disabled** |
| PATCH | **Disabled** |

Transient-failure candidates: network reset, `408`, `429` (subject to policy), `502`, `503`, `504`.

Supporting rules:

- Exponential backoff with jitter; honour `Retry-After`.
- **Retries must never exceed the overall tool deadline.** A retry budget that outlives its timeout
  is a hang, not resilience (TIP §22).
- Enabling retry on a non-idempotent method is an explicit, per-tool configuration act — never
  inherited silently from a project default.
- The related safety default: no `DESTRUCTIVE` or `PRIVILEGED` operation is auto-enabled merely
  because it exists in the source API (BR-006). Retry policy and exposure policy reinforce each other.

## Consequences

**Positive.** The failure mode is a reported error rather than duplicated side effects — errors are
recoverable, duplicate deletions are not. Aligns with the risk engine's classification so safety
reasoning is consistent across the product. Matches G2: unsafe behaviour is not silently available.

**Negative.** Genuinely idempotent `POST` and `PUT` endpoints — common with idempotency keys — get
less resilience than they could, until a user configures it. Some flaky-upstream failures surface to
the agent that a retry would have hidden, which will be reported as the product being less robust than
a naive generator.

Both are accepted: a visible error is a better default than an invisible duplicate.

## Enforcement

- Unit test: DELETE, POST, and PATCH are never retried absent explicit configuration. Blocking.
- Unit test: total retry duration never exceeds the configured tool deadline.
- Risk classification is surfaced in the UI next to retry configuration, so the two decisions are made
  together.
- BR-006 is an MVP/MUST invariant.
