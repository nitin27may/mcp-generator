# ADR-0003 — OpenAPI parser types never escape the adapter package

- **Status:** Accepted — **MANDATORY** (TIP §66 Decision 3)
- **Date:** 2026-08-17
- **Relates to:** TIP §5, §6, §91 · BRD FR-NORM-002, §24 R4

## Context

The platform parses four OpenAPI families (2.0, 3.0, 3.1, 3.2) using `@scalar/openapi-parser`. It is
tempting to pass the parser's AST straight into readiness rules, the binding engine, and the UI —
the types are already there and they describe the document accurately.

Doing so would make a third-party library's type surface our permanent business domain model. Every
consumer would then encode assumptions about a specific parser and a specific OpenAPI version's
shape. Swapping the parser, or absorbing an OpenAPI revision, would become a change to every
package. BRD §24 R4 names parser lock-in as an explicit risk.

There is a second, subtler problem: an OpenAPI AST is a *document* model, not a *domain* model. It has
no stable operation identity, no normalized schema dialect, and no place for our diagnostics or
provenance — all of which reconciliation (FR-REC-*) depends on.

## Decision

`@scalar/openapi-parser` — and any other parser — may be imported **only** by `openapi-adapter`.

That package's public API accepts raw documents and returns `CanonicalApi` from `domain`. No
parser-native type appears in any signature it exports. Version-specific handling lives in
version adapters inside the package.

`domain` itself depends on nothing but TypeScript/runtime primitives: no parser, no MCP SDK, no
database, no framework.

## Consequences

**Positive.** The parser is replaceable, and `swagger2openapi` or Redocly can be added for specific
edge cases without touching consumers. Readiness rules, binding, and generation are written against
one stable model rather than four document shapes. Absorbing OpenAPI 4.0 becomes a new version adapter
rather than a migration.

**Negative.** Real translation work, not a re-export — the canonical model is XL complexity (TIP §6,
§10) and must carry source pointers and fingerprints the parser does not provide. Some parser
information is deliberately dropped, and each omission has to be a considered decision rather than an
accident.

## Enforcement

- `boundaries` script (TIP §91.2): no package other than `openapi-adapter` may list or import
  `@scalar/*`. Runs in the `lint` CI job; blocking per TIP §49.
- ESLint `no-restricted-imports` as a fast local signal.
- `domain`'s `dependencies` must be empty — checked by the same script.
