# ADR-0001 — Portable configuration is the source of truth

- **Status:** Accepted (Recommended — TIP §66 Decision 1)
- **Date:** 2026-08-17
- **Relates to:** TIP §11, §29, §80 · BRD §5 D1, BR-010

## Context

The obvious shape for an OpenAPI-to-MCP product is a code generator: read a spec, emit a server,
hand it over. That makes generated source the primary artifact. Everything the user decides — which
operations to expose, what to call them, how values bind, what is destructive — then lives only in
emitted code.

That has three consequences we cannot accept. User intent becomes unrecoverable when the OpenAPI
contract changes, so reconciliation (FR-REC-*) is impossible. Protocol revisions force regenerating
and re-reviewing every artifact. And governance has nothing to govern: there is no reviewable,
diffable description of the agent-facing surface.

## Decision

The **portable MCP definition** (`mcp.config.json`) is the durable, versioned, source-of-truth
artifact. Generated code is derived output and may be recreated at any time.

Concretely:

- Every user decision is expressed in the config, never only in generated source.
- The config is JSON-Schema validated, versioned (`schemaVersion`), and migratable (TIP §34).
- The config is language- and protocol-independent where possible.
- Regenerating from an unchanged config and canonical model produces an equivalent artifact.

## Consequences

**Positive.** Reconciliation across API versions becomes tractable, because intent is stored
separately from the spec it was derived from. Protocol and language changes are regeneration
concerns, not migration projects. The config is reviewable in a pull request, which is what makes a
governance lifecycle possible at all. Multi-language emission stays open.

**Negative.** The config schema becomes a public contract with real migration obligations — a
schema change requires a migration in the same release (TIP §90.5). Users who hand-edit generated
source are working against the grain; TIP §67 HP7 names this as a hard problem.

## Enforcement

- `config-schema` owns the schema; nothing else defines config shape.
- Determinism test (§86 `determinism`): identical generator + canonical model + config produces
  byte-identical output except intentional timestamps.
- Every generated artifact carries a manifest recording the config hash (TIP §39).
