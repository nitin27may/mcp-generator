# ADR-0002 — Generated runtime is data-driven, not per-operation bespoke code

- **Status:** Accepted (Strongly recommended — TIP §66 Decision 2)
- **Date:** 2026-08-17
- **Relates to:** TIP §20, §28, §29, §30 · BRD §24 R9

## Context

A generator can emit one HTTP function per API operation. For a 500-operation API that is 500
near-identical functions: 500 places for a bug, 500 files in a diff when anything changes, and no way
to ship a security fix without every user regenerating.

The alternative is a stable runtime library plus a thin generated manifest describing operations
declaratively.

## Decision

The generator emits a **manifest**, not per-operation logic. A shared `UpstreamExecutor` in
`upstream-http` performs all request construction, auth attachment, timeout, cancellation, retry,
response limiting, and error mapping, driven by manifest data.

```text
generated artifact = runtime library dependency + generated manifest + config + package metadata
```

Two output modes are offered (`GenerationConfig.mode`): `thin` (depends on the published runtime) and
`self-contained` (vendors the runtime for users who need no external dependency). Neither mode emits
bespoke per-operation HTTP code.

An "expanded source" export may be added later for users who explicitly want bespoke code, as an
escape hatch — not the default.

## Consequences

**Positive.** A runtime bug is fixed once and delivered as a version bump. Diffs on regeneration are
small and reviewable. Behaviour is consistent across every tool and every generated project.
Generation is fast, because it is mostly templating. The protocol's statelessness (TIP §92.8) fits
this model — there is no per-session state to reconstruct.

**Negative.** Users lose the ability to hand-patch a single operation's HTTP behaviour; anything
operation-specific must be expressible in the manifest, which pushes complexity into the config
schema. Thin mode couples generated packages to a published runtime version, so the runtime's
compatibility policy becomes a product commitment (BRD §24 R9 names generated-package drift as a
Medium/High risk, mitigated precisely by this shared dependency).

## Enforcement

- `generator` may depend on the config/runtime model and templates only.
- Review rule: a pull request adding per-operation emitted logic must either be rejected or amend
  this ADR.
- `generated-e2e` (§86) builds and runs a generated package from a clean checkout, so manifest-driven
  execution is proven, not assumed.
