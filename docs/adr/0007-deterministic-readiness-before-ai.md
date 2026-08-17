# ADR-0007 — Readiness is deterministic first, AI second

- **Status:** Accepted — **MANDATORY** for trust and cost (TIP §66 Decision 7)
- **Date:** 2026-08-17
- **Relates to:** TIP §14, §16, §42, §85 · BRD G8, FR-ARA-005, FR-AI-001…005

## Context

Agent readiness analysis is the product's differentiated IP. An LLM could plausibly produce the whole
analysis: hand it a spec, ask which endpoints are agent-ready.

That fails on four counts. It is non-reproducible, so the same API scores differently on Tuesday and
the finding list churns between runs. It is unexplainable, so a user cannot see *why* an operation
scored badly or what to fix. It costs money per analysis, on the product's core loop. And it cannot
run in an enterprise that has disabled external AI processing (FR-AI-005) — which is exactly the
customer segment that wants governance.

There is also an ordering argument. Deterministic findings are the best possible *input* to an LLM:
"this operation has no description and its name is a generic verb" is a far better prompt than the raw
schema.

## Decision

The readiness engine is deterministic. AI is an optional augmentation layered on top.

- All 30 rules in TIP §85 are deterministic and rule-based. Same input, byte-identical findings.
- Scoring is explicit and inspectable: `weightedAverage(categoryScores) - blockingPenalty`, with
  per-dimension contributions exposed. No opaque single number (FR-ARA-002).
- AI runs **after** deterministic analysis and receives minimized input: the operation's name,
  summary, description, inputs, and the deterministic findings — not unrelated parts of the API
  (TIP §14.6).
- AI output is a **suggestion**. It is labelled, carries provenance (model, provider, prompt
  version, acceptance status), requires explicit user acceptance, and never silently alters semantics
  or production configuration.
- Hidden model reasoning is not stored.
- The entire AI path is disableable per deployment. With AI off, readiness is fully functional.
- `readiness-engine` and `risk-engine` must not depend on the MCP SDK, the parser, or UI — they take
  `CanonicalApi` and return findings.
- Semantic duplicate detection via embeddings (TIP §16.2) may *recommend* but must **never**
  auto-remove an operation.

## Consequences

**Positive.** Findings are reproducible, so golden tests are possible and rule regressions are
visible. Every finding is explainable and carries a remediation, which is the difference between a
score and a tool. Zero marginal cost on the core loop. Works in air-gapped and AI-disabled
deployments. Rules can be pruned using the acceptance-rate metric (BRD §32) because their behaviour is
attributable.

**Negative.** Writing 30 good rules is XL work (10–15 dev-days) and slower than prompting.
Deterministic rules will miss genuinely semantic problems that a model would catch — the mitigation is
that AI augmentation exists, not that the rules are perfect. Rule thresholds need tuning against the
fixture corpus, which is real calibration effort.

## Enforcement

- Determinism test: the same fixture yields byte-identical findings across runs.
- Every rule has a unit test asserting both a positive and a negative case (P3 exit criteria).
- A CI job runs the full readiness suite with AI disabled; it must pass.
- `boundaries` script: `readiness-engine` and `risk-engine` import allowlist excludes the SDK, the
  parser, and UI packages.
