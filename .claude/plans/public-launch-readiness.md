# Public-launch readiness plan (groundwork, not the flip)

**Created:** 2026-08-20
**Status:** groundwork in progress — visibility flip is a separate, later, manual step

This is the checklist for taking this repo from private to public properly — real fixes, not a claim of readiness. Pull this file on any machine to resume exactly where the work left off. Update the checkboxes as items land; don't delete finished sections, so the history of what was verified stays in the repo.

**The visibility flip itself is out of scope for this plan.** It happens manually, once every blocker below is closed, and is not something automated here.

---

## Owner-only prerequisites (not automatable — start these in parallel with everything else)

- [ ] **U1 — Fix GitHub Actions billing** on the account (failed payment / spending limit). All CI runs on `main` have failed on this billing block, never on code — there is currently **zero verified CI signal** on any job. This blocks: required status checks, Dependabot enablement, the release workflow, the CI badge, and the flip itself.
- [ ] **U2 — npm account prep**: a token scoped to `@nitin27may/*`, with 2FA set to "auth and publish" (a bare "auth and writes only" token cannot publish). Only needed for Phase 5 (post-flip), not the flip itself.
- [ ] **U3 — Manually verify the delegated/OAuth token authorization flow end-to-end.** Status unknown as of this plan — never confirmed whether this was actually exercised against a real upstream. This project's entire value proposition is governed credential access (see ADR-0005's two auth planes, `packages/upstream-auth`), so an unverified auth path is a real risk, not a nice-to-have. Test: token acquisition, delegation/on-behalf-of flow if applicable, an actual upstream call using the resulting token, and confirm no token or secret ever surfaces in logs/config/MCP tool responses (cross-check against `packages/redaction`). Use a real OAuth/delegated-token upstream, not just the sentinel fixtures in `*.test.ts`. **If already tested and working, check this box and add a one-line note of what was verified and when. If not, this is a hard gate on the flip — do not skip it.**

**Standing rule for every PR below:** don't claim "CI passing" anywhere (PR description, README, badge) until a real green run has been observed on the Actions tab. Until U1 is fixed, the only defensible claim is "the verification chain in `docs/CONTRIBUTING.md` passes locally."

---

## Audit findings (why this checklist exists)

**Launch-blocking, as found:**
1. CI has never once succeeded (billing block — U1).
2. Never published anywhere — every package is `0.0.0`/`private: true`; `docs/CONTRIBUTING.md` has an explicit unfinished npm-publish TODO section; no tags, no releases.
3. Missing OSS/community-health files: `SECURITY.md` (the biggest gap — this project handles API credentials), `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, issue/PR templates. (LICENSE and CONTRIBUTING.md already exist and are solid.)
4. No branch protection on `main`, no `dependabot.yml`.
5. Delegated/OAuth token auth flow — end-to-end manual test status unknown (U3).

**Non-blocking, worth a deliberate decision:** README has 2 unused hero images and no in-README screenshots/demo GIF. `docs/BRD.md`/`docs/TECHNICAL-PLAN.md` are large internal planning docs living in the public `docs/` folder (decision: keep them, see Phase 1). Wiki enabled but likely unused; Discussions disabled.

**Already clean, no action needed:** security posture (no leaked secrets, thorough `.gitignore`, CI secret-grep gate, secrets-as-references architecture per ADR-0006). Code quality (89 test files, ESLint + custom architecture-boundary linter, no stray debug code). Docs depth (9 real ADRs, maintained risk register, BRD, technical plan).

---

## Phase 1 — Documentation truth pass (no dependencies, start immediately)

- [ ] **README.md**: add a "Project status" section (pre-release, not yet on npm, install-from-source works fully today) and a "Known limitations" section (list below). Remove the parenthetical "not yet published to the registry" in favor of the status section.
- [ ] **`docs/CONTRIBUTING.md`**: rewrite "Publishing to npm — TODO, not yet live" → "Publishing to npm" with a short "not yet live" first line; keep the 3 real prerequisites; drop the sentence disclosing exhausted Actions credit (billing status shouldn't be public).
- [ ] **`docs/BRD.md`**:
  - Close **OQ-02** (npm scope) — reality already decided: `@nitin27may/mcpgen` is the published name, `@mcpgen/*` stays private forever. Leaving it "Open" contradicts the shipped manifest.
  - Resolve or reframe **OQ-03** (which readiness rules are open-source vs. commercial — currently frames the core rule set as a possible future "moat"). Recommended answer: all 30 deterministic rules in this repo are MIT and stay MIT; any future commercial offering would be hosting/collaboration, not rule withholding. This is the single line most likely to be quoted by someone deciding whether to build on this project — don't leave it as-is.
  - Add a short status banner at the top: this is the engineering record, not a roadmap commitment; for what ships today see the README's Known limitations.
- [ ] **`docs/TECHNICAL-PLAN.md`**: same status banner. Surface `P1-W13-T01` (cancellation propagation) as a real known limitation, not just a `todo` table row — verified via code: `packages/upstream-http/src/execute.ts` accepts a cancellation signal but `mcp-runtime` never wires it up, so an MCP `notifications/cancelled` is currently silently ignored and the upstream call runs to timeout. The other 4 `todo` rows (config inheritance, config migration framework, fixture corpus, OTEL) are legitimate forward roadmap, cleanly absent from code — no disclosure needed beyond the banner.
- [ ] **Known limitations list** (README, cross-referenced from BRD/TECHNICAL-PLAN banners):
  - Cancellation: `notifications/cancelled` doesn't yet abort an in-flight upstream call (`P1-W13-T01`).
  - No config inheritance or schema migration yet (`schemaVersion` pinned at `1.0`).
  - Legacy MCP protocol eras disabled by design (ADR-0009).
  - Oversized upstream responses are rejected, not paginated/projected.
  - Web wizard is desktop-only by design.
  - Single maintainer, best-effort support.
  - Delegated/OAuth token flow — state the real, verified status once U3 is done.

## Phase 2 — New community-health files

Voice: match the existing README/CONTRIBUTING tone — direct, second person, cites real ADRs/file paths, no marketing filler, no emoji.

- [ ] **`SECURITY.md`** (repo root). Intro tying the policy to ADR-0006; reporting instructions (GitHub private vulnerability reporting primary, `nitin27may@gmail.com` fallback; no public issues, no real credentials in reports); response-time targets (ack 3 days, triage 7 days, fix 30 days for critical/high, coordinated disclosure 90 days, best-effort/single maintainer); supported versions (pre-1.0, `main` only); **in-scope**: secret leakage anywhere (config/generated package/logs/traces/MCP responses), spec-import SSRF, generation-time injection (path traversal, zip-slip, header/URL injection), governance bypass (privileged op callable without being enabled, retry on a destructive op, risk-classification evasion), MCP transport issues (DNS rebinding, token audience confusion, upstream-token passthrough across auth planes), web-wizard path/workspace escape; **out-of-scope**: bugs in the imported API itself, consequences of deliberately enabling a destructive tool, secrets the user put in their own shell/dotenv, exposing the wizard beyond localhost (no auth by design), third-party dependency CVEs (report upstream); what already guards these (ADR-0006, `packages/redaction`, safe-fetch/IP blocklist, CI secret-grep gate); safe-harbor line. Verify the "no accounts, no auth" and per-project isolation claims against `apps/web/src/server/env.ts` before merging.
- [ ] **`CHANGELOG.md`** (Keep a Changelog + SemVer). Don't reconstruct 3 days of private commit history — note that pre-first-release history isn't itemized since nothing was ever published; `git log` has the detail. Pre-1.0 note: compatibility contract is `mcp.config.json`'s `schemaVersion` (currently "1.0"), not the CLI version; flags/rule IDs may change in a 0.x minor. `## [Unreleased]` section listing the shipped surface at feature altitude, plus a "Known limitations" pointer to the README section. First real section becomes `## [0.1.0] - <date>` at publish time. Add a line to CONTRIBUTING: user-visible changes need an `[Unreleased]` entry in the same PR.
- [ ] **`.github/ISSUE_TEMPLATE/`** — YAML forms (required-field enforcement matters here since a bad report might contain a real credential):
  - `config.yml` — blank issues disabled; contact links to private security reporting, `docs/README.md`, `docs/BRD.md#36-non-goals-by-release`.
  - `bug_report.yml` — surface dropdown, install path, version/SHA, Node version, OS, exact command, exit code, output, diagnostic codes, minimal spec fragment, **required checkbox: no credentials/tokens/internal hostnames in this report**, required checkbox: not a security vulnerability (pointer to SECURITY.md).
  - `spec_compat.yml` — "an OpenAPI document mcpgen handles wrong": OAS version, minimal reproducing spec, which stage misbehaved, actual vs. expected output.
  - `feature_request.yml` — problem before proposal; required field: which requirement/ADR this touches, or confirmation it's not a listed non-goal.
- [ ] **`.github/PULL_REQUEST_TEMPLATE.md`** — mirrors the real verification chain: what/why, WBS task ID (N/A allowed), checklist running `pnpm lint && build && test && test:integration && test:security` (+ Playwright if `apps/web` touched, + `lint:boundaries`) with the outcome pasted in, not just ticked; ADR-compliance checkbox; no-new-secret-literal checkbox; golden-snapshot checkbox; changelog-entry checkbox.
- [ ] **`CODE_OF_CONDUCT.md`** — Contributor Covenant 2.1 verbatim, enforcement contact `nitin27may@gmail.com`. (The one file where boilerplate is correct.)
- [ ] **`.github/CODEOWNERS`** — one line: `* @nitin27may`.

## Phase 3 — Repo configuration

- [ ] **`.github/dependabot.yml`** — commit now, **enable only after U1 is fixed** (a first-week flood of update PRs against metered Actions is a bill, not a benefit yet). npm ecosystem at `/` (pnpm workspace), grouped (dev-tooling, next-and-react, minor-and-patch), weekly. GitHub Actions ecosystem, weekly. Docker ecosystem for `apps/web` (confirm Dockerfile path). **Explicitly ignore `@modelcontextprotocol/*`** — pinned exact per ADR-0009/`docs/research/sdk-v2-api-notes.md`, and `docs/RISKS.md` already documents an incident (R12) caused by a wrong version read from this exact package family. Bump these manually, with wire-level re-verification, never on a bot's schedule.
- [ ] **Branch ruleset on `main`** (repository ruleset, not legacy branch protection), bypass = repository admin while solo:
  - **Stage A (do now, safe with CI broken)**: block force-pushes and deletions, require linear history, require PR before merge with **0 required approvals**, require conversation resolution.
  - **Stage B (only after the first real green CI run)**: add required status checks for the 4 CI jobs, require branches up to date. Don't add required checks while billing is broken — blocked runs never report a conclusion and every PR hangs forever.
- [ ] **Full git-history secret scan** — CI's `security` job only scans the working tree; history becomes public at the flip too and has never been scanned. Cheap, non-optional, hard gate on the flip.
- [ ] **Repo settings (UI, no PR)**: secret scanning + push protection on; private vulnerability reporting on; Dependabot alerts on (security updates on once billing fixed); Actions → require approval for all external contributors; Wiki off; Discussions off initially; description/topics/homepage set (README already lists the topic set to paste); squash-merge only, auto-delete head branches.

## Phase 4 — The flip

Gated on: all Phase 1–3 items, U1, **U3 (hard gate)**, and one real green CI run observed. U2 is not required for the flip, only for Phase 5. Manual step in GitHub settings — not automated.

## Phase 5 — Post-flip (deliberately deferred, not part of this groundwork)

- [ ] **npm publish decision: defer v0.1.0 until after the flip.** npm provenance requires a public repo + GitHub Actions OIDC — unobtainable pre-flip. `apps/cli/publish/package.template.json` already points `homepage`/`repository`/`bugs` at the GitHub repo, so publishing while private would ship 404 links on the npm package page. No name-squatting risk (`@nitin27may` is the maintainer's own scope). Don't publish an interim `0.0.1` — go straight to `0.1.0` from CI with provenance.
- [ ] `.github/workflows/release.yml` (workflow_dispatch, `NPM_TOKEN`, `id-token: write` for provenance) — call `scripts/release.sh` rather than reimplementing release logic in YAML.
- [ ] v0.1.0 publish + git tag + GitHub Release + `CHANGELOG.md` 0.1.0 section + README install-section switch (source → `npx @nitin27may/mcpgen`).
- [ ] README screenshots / the two orphaned hero images / demo GIF.
- [ ] Coverage thresholds in `vitest.config.ts`, CodeQL / OpenSSF Scorecard.
- [ ] Implement `P1-W13-T01` cancellation propagation.

---

## Sequencing summary

```
U1 (billing), U2 (npm), U3 (OAuth test)  ─── start now, in parallel, owner-only

Phase 1 (docs truth)   ─┐  independent PRs, any order, start immediately
Phase 2 (new files)    ─┤
                        │
Phase 3.1 dependabot.yml (commit only)     ─┘  no dependency on U1
Phase 3.2 Stage A ruleset                    ─┘
Phase 3.3 full git-history secret scan       ─┘  hard gate on flip
Phase 3.4 repo settings                      ─┘

── gated on U1 ──
  Observe 1 real green CI run
  Stage B ruleset (required checks) + CI badge
  Enable dependabot

── Phase 4: THE FLIP ── gated on Phases 1-3 complete + U3 confirmed + 1 green CI run

── Phase 5 (post-flip, needs U2 + public repo) ──
  release.yml → v0.1.0 publish → screenshots → coverage/CodeQL → cancellation fix
```

Phases 1–2 have no dependency on U1/U2/U3 and should start immediately regardless of how long billing takes to fix. The flip itself is the only thing that waits on everything.

---

## Critical files

- `README.md` — Project status + Known limitations sections; install section switches at v0.1.0
- `docs/CONTRIBUTING.md` — npm section rewrite, billing sentence removed, changelog-entry rule added
- `docs/BRD.md` — OQ-02 closed, OQ-03 resolved/reframed, status banner (~line 1741)
- `docs/TECHNICAL-PLAN.md` — status banner; `P1-W13-T01` (~line 2464) surfaced as a public known limitation
- `SECURITY.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` — new, root
- `.github/ISSUE_TEMPLATE/*.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/dependabot.yml` — new
- `.github/workflows/ci.yml` — source of the 4 required-check names for ruleset Stage B
- `scripts/release.sh` — the release path Phase 5's workflow must call, not duplicate
- `packages/upstream-auth`, `docs/adr/0005-*` — where to focus the U3 manual OAuth/delegated-token verification

---

## Verification

- Phase 1–2: standard chain per CONTRIBUTING (`pnpm lint && pnpm build && pnpm test && pnpm run test:integration && pnpm run test:security`), plus a manual read-through of every new/edited doc for tone and broken links.
- Phase 3: `gh api` check that the ruleset applied as expected on `main`; confirm `dependabot.yml` is valid.
- U3: document the manual test transcript/notes of the OAuth/delegated-token flow, referenced from the README's Known limitations line.
- Full git-history secret scan: run before Phase 4, not after.
