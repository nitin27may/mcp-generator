## What and why

<!-- What changes, and what problem it solves. If it fixes an issue, link it. -->

**WBS task:** <!-- e.g. P1-W10-T01, or N/A -->

## Verification

Paste the outcome rather than ticking a box — a checkbox records intent, output records what
happened.

```
pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test
pnpm exec vitest run --project integration --passWithNoTests
pnpm exec vitest run --project security --passWithNoTests
pnpm exec vitest run --project e2e --passWithNoTests
# if apps/web changed:
pnpm --filter @mcpgen/web exec playwright test
```

<details><summary>Output</summary>

```
<!-- paste it here -->
```

</details>

## Checks

- [ ] No mandatory ADR is violated, or this PR amends the ADR it changes
      ([docs/adr/](../docs/adr/) — eight of ten are mandatory)
- [ ] No new credential-shaped literal outside a test sentinel (`node tooling/scripts/scan-secrets.mjs`)
- [ ] Golden snapshots reviewed if they changed — a snapshot updated without being read is not a test
- [ ] User-visible changes have a `## [Unreleased]` entry in [CHANGELOG.md](../CHANGELOG.md)
- [ ] `mcp.config.json` shape changed → `schemas/mcp.config.schema.json` regenerated
      (`node tooling/scripts/build-config-schema.mjs`)

## Anything reviewers should look at closely

<!-- Trade-offs, things you were unsure about, things you'd like a second opinion on. -->
