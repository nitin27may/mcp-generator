# CLAUDE.md

Guidance for Claude Code working in this repository.

`mcp-generator` ingests an OpenAPI document, scores whether the API is fit for
agent consumption, lets a human curate a safe tool surface, and emits a portable
**`mcp.config.json`** that a shared runtime executes over stdio or Streamable
HTTP. `README.md` covers the product; `docs/adr/` holds the decisions. This file
covers the invariants a change has to respect.

## Commands

pnpm 11 + Turborepo. Node 22 LTS.

```bash
pnpm build            # turbo run build
pnpm dev              # turbo run dev
pnpm typecheck        # turbo run typecheck
pnpm lint             # eslint . && the boundary checker (see below)
pnpm test             # vitest: unit + golden + component
pnpm test:e2e
pnpm test:security
pnpm test:integration
pnpm test:all         # every project
pnpm golden:update    # re-record golden snapshots — read the diff, don't rubber-stamp
```

`pnpm lint` is two gates, not one. The second is
`tooling/scripts/boundaries.mjs`, and it fails the build.

## The layout is the architecture

Sixteen packages under `packages/`, two apps under `apps/` (`cli`, `web`). The
package split *is* the enforcement mechanism — most of the ADRs are statements
about which package may import what, and `boundaries.mjs` checks both declared
dependencies and actual import text, because a transitive import bypasses a
manifest check and a phantom dependency bypasses an import check.

The rules it enforces, each traceable to an ADR:

| Rule | Meaning |
|---|---|
| `domain-pure` | `domain` has zero runtime dependencies |
| `parser-confined` | only `openapi-adapter` may touch `@scalar/*` (ADR-0003) |
| `sdk-confined` | only `mcp-protocol` may touch `@modelcontextprotocol/*` (ADR-0004) |
| `analysis-pure` | `readiness-engine` / `risk-engine` use no SDK, parser, or UI (ADR-0007) |
| `contracts-pure` | `control-contracts` imports no react/next/UI |
| `auth-planes-separate` | `upstream-auth` must not import `mcp-protocol` (ADR-0005) |
| `apps-are-leaves` | no package may import from `apps/*` |
| `modern-era-only` | no `McpServer#connect()` — it silently serves the legacy protocol era (ADR-0009) |

**If a change needs one of these relaxed, that is an ADR, not an edit to the
checker.** The checker itself has a regression test that points it at fixture
workspaces to prove it fails when it should — an untested gate is decoration.

## Decisions you are expected to already know

Read the ADR before working in the area it governs. The ones that most often
catch people out:

- **ADR-0001** — the portable config is the source of truth. The durable artifact
  is `mcp.config.json` (schema: `schemas/mcp.config.schema.json`), *not*
  generated source. Nothing should emit a server people are expected to edit.
- **ADR-0002** — the runtime is data-driven. Behaviour comes from the config, not
  from code branches per API.
- **ADR-0006** — secrets are references only. A literal credential must never
  reach a config file, a fixture, or a test.
- **ADR-0008** — destructive retry is off by default. Do not flip a default to
  make a flaky test pass.
- **ADR-0010** — token exchange, not passthrough. An upstream token is exchanged,
  never forwarded as-is.

## Tests

Six vitest projects, and they are not interchangeable:

- `unit` — the default.
- `golden` — `packages/*/test/golden/**`. Snapshot output of the generator. A
  changed golden file is a change to what users receive; `pnpm golden:update`
  re-records, but the diff is the review.
- `component`, `integration`, `e2e`, `security` — run explicitly; `test:all`
  runs everything.

Fixtures live in `fixtures/` (`openapi-3.1`, `oauth-sandbox`) and
`packages/test-fixtures`. Prefer extending those over inlining a document in a
test.

## Notes

- `apps/web/AGENTS.md` (and the `CLAUDE.md` next to it, which is a one-line
  `@AGENTS.md` pointer) is **written by `next dev`**, not by hand — see
  `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a
  diff only recreates the uncommitted change; commit it with your work.
- `.claude/plans/` holds worked plans for in-flight tracks. Read the relevant one
  before starting on that area.
- The docs site is MkDocs Material (`site/`, `overrides/`) and has **no deploy
  workflow** — it is published by hand. A green CI run says nothing about whether
  the published docs match this repo.
