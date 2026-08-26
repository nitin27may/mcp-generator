# Public-launch readiness plan (groundwork, not the flip)

**Created:** 2026-08-20
**Last updated:** 2026-08-21
**Status:** groundwork complete except for the owner-only steps. Everything automatable is
done and merged; what remains needs repository-owner access.

---

## Progress as of 2026-08-21

Merged to `main` in seven pull requests:

| # | What | Note |
|---|---|---|
| 1 | CI made able to pass | **First green run in this repo's history.** Four separate causes, none of them product bugs |
| 2 | OAuth Plane A (`P6-W23-E01`) | The server is now an OAuth 2.0 Resource Server |
| 3 | Plane B token exchange (ADR-0010) | Acting as the caller, without forwarding their token |
| 4 | OAuth sandbox | Keycloak + protected API + SSO demo — **this closes U3** |
| 5 | Web UI responsive + dark mode | 787px of horizontal overflow at 375px → 0 |
| 6 | Documentation | Config reference, CLI, OAuth, architecture, troubleshooting, JSON Schema |
| 7 | Community health + release workflow | SECURITY.md, templates, dependabot, release.yml |

Test counts: unit/golden 606 → **641**, security 32 → **58**, protocol E2E 39 → **46**,
Playwright 26 → **44**.

### Why CI had never passed

The billing explanation was stale — billing was already fixed and the last run on `main`
executed for real. `protocol E2E` passed; the other three failed on their own merits:

1. `security` and `web-e2e` never ran `pnpm build`, so two packages had no `dist/`.
2. `apps/web` typechecked before `next typegen`, so the generated `RouteContext` global did
   not exist. This passed locally *only* because a stale `.next` was present.
3. The secret-literal scan **had never once executed** — the step before it always failed
   first — and matched 20+ legitimate test sentinels, so it could never have passed.
4. Two TypeScript majors in one workspace.

### What running against a real identity provider found

Three defects the in-repo fixture IdP structurally could not surface:

- The audience check understood **only URLs**. Keycloak mints a client id, Entra ID mints
  `api://<guid>`, Auth0 mints an API identifier — Plane A would have rejected every token
  from every real enterprise IdP. Tests passed because our own fixture minted URLs.
- `resource` was doing two jobs: the RFC 9728 discovery URL and the audience to compare.
  Now separate fields.
- Keycloak emits no `aud` at all without explicit audience mappers, and declaring
  `clientScopes` in a realm export silently replaces the built-in set.

---

This is the checklist for taking this repo from private to public properly — real fixes, not a claim of readiness. Pull this file on any machine to resume exactly where the work left off. Update the checkboxes as items land; don't delete finished sections, so the history of what was verified stays in the repo.

**The visibility flip itself is out of scope for this plan.** It happens manually, once every blocker below is closed, and is not something automated here.

---

## Owner-only prerequisites (not automatable — start these in parallel with everything else)

- [x] **U1 — GitHub Actions billing** — resolved. CI has been green on every PR since #1; the original diagnosis (a billing block) was already stale when this plan was written.
- [ ] **U2 — npm account prep**: a token scoped to `@nitin27may/*`, with 2FA set to "auth and publish" (a bare "auth and writes only" token cannot publish). Only needed for Phase 5 (post-flip), not the flip itself.
- [x] **U3 — Delegated/OAuth flow verified end to end against Keycloak 26** (2026-08-21). Transcript in `examples/oauth-sandbox/README.md`. The proof is a pair of observations: Alice's token is refused by the Orders API directly, yet her tool call succeeds and returns only her own orders — so a different token reached the upstream. Permanent coverage: `token-passthrough.test.ts`, `token-exchange-delegation.test.ts`, `mcp-access.test.ts`, `serve-http-access.test.ts`.

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

- [x] **README.md** — Project status and Known limitations sections added; the OpenAPI 3.2 badge corrected to match what is actually supported.
- [x] **`docs/CONTRIBUTING.md`** — npm section rewritten, the sentence disclosing exhausted Actions credit removed, and the changelog-entry rule added.
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

- [x] **`SECURITY.md`** — written. The "no accounts, no authentication" claim was verified against `apps/web/src/server/env.ts` and the route handlers before being written down.
- [x] **`CHANGELOG.md`** — written (Keep a Changelog + SemVer), with the pre-1.0 note that `schemaVersion` is the compatibility contract, not the CLI version.
- [x] **`.github/ISSUE_TEMPLATE/`** — four YAML forms, both required credential checkboxes, blank issues disabled.
  - `config.yml` — blank issues disabled; contact links to private security reporting, `docs/README.md`, `docs/BRD.md#36-non-goals-by-release`.
  - `bug_report.yml` — surface dropdown, install path, version/SHA, Node version, OS, exact command, exit code, output, diagnostic codes, minimal spec fragment, **required checkbox: no credentials/tokens/internal hostnames in this report**, required checkbox: not a security vulnerability (pointer to SECURITY.md).
  - `spec_compat.yml` — "an OpenAPI document mcpgen handles wrong": OAS version, minimal reproducing spec, which stage misbehaved, actual vs. expected output.
  - `feature_request.yml` — problem before proposal; required field: which requirement/ADR this touches, or confirmation it's not a listed non-goal.
- [x] **`.github/PULL_REQUEST_TEMPLATE.md`** — mirrors the real verification chain and asks for pasted output rather than ticked boxes.
- [x] **`CODE_OF_CONDUCT.md`** — Contributor Covenant 2.1 verbatim.
- [x] **`.github/CODEOWNERS`** — one line.

## Phase 3 — Repo configuration

- [x] **`.github/dependabot.yml`** — committed with `@modelcontextprotocol/*` explicitly ignored (ADR-0009, R12). Enable in the UI when ready.
- [ ] **Branch ruleset on `main`** (repository ruleset, not legacy branch protection), bypass = repository admin while solo:
  - **Stage A (do now, safe with CI broken)**: block force-pushes and deletions, require linear history, require PR before merge with **0 required approvals**, require conversation resolution.
  - **Stage B (only after the first real green CI run)**: add required status checks for the 4 CI jobs, require branches up to date. Don't add required checks while billing is broken — blocked runs never report a conclusion and every PR hangs forever.
- [x] **Full git-history secret scan** — 857 blobs across 1682 objects. No real credentials. All 8 matches were historical versions of test sentinels since renamed, or a regex false positive on a TypeScript ternary (`? 'secret' : 'environment'`).
- [ ] **Repo settings (UI, no PR)**: secret scanning + push protection on; private vulnerability reporting on; Dependabot alerts on (security updates on once billing fixed); Actions → require approval for all external contributors; Wiki off; Discussions off initially; description/topics/homepage set (README already lists the topic set to paste); squash-merge only, auto-delete head branches.

## Phase 4 — The flip

Gated on: all Phase 1–3 items, U1, **U3 (hard gate)**, and one real green CI run observed. U2 is not required for the flip, only for Phase 5. Manual step in GitHub settings — not automated.

## Phase 5 — Post-flip (deliberately deferred, not part of this groundwork)

- [ ] **npm publish decision: defer v0.1.0 until after the flip.** npm provenance requires a public repo + GitHub Actions OIDC — unobtainable pre-flip. `apps/cli/publish/package.template.json` already points `homepage`/`repository`/`bugs` at the GitHub repo, so publishing while private would ship 404 links on the npm package page. No name-squatting risk (`@nitin27may` is the maintainer's own scope). Don't publish an interim `0.0.1` — go straight to `0.1.0` from CI with provenance.
- [x] `.github/workflows/release.yml` — written; `workflow_dispatch` only, requests `id-token: write` at job level, and calls `scripts/release.sh` rather than reimplementing it.
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


---

## What is left, and who can do it

Everything below needs repository-owner access. Nothing else is blocking.

### Owner-only, before the flip

- [ ] **Repository settings** (UI): secret scanning + push protection on; private vulnerability
      reporting on; Dependabot alerts on; Actions → require approval for external contributors;
      Wiki off; Discussions off initially; description, topics and homepage set; squash-merge
      only; auto-delete head branches.
- [ ] **Branch ruleset on `main`**: block force-push and deletion, require linear history,
      require a PR, require conversation resolution, then add the four required status checks.
      **The check names contain U+00B7** — `lint · typecheck · build · test`, `security suite`,
      `protocol E2E`, `web wizard E2E + accessibility` — and must match byte-exact.
- [ ] **Enable Dependabot** once the ruleset is in place.

### The flip

- [ ] **Make the repository public.** Manual, deliberate, and gated on everything above.

### After the flip

- [ ] **U2 — npm account**: a granular token scoped to `@nitin27may/*`, 2FA set to
      **"auth and publish"** (a bare "auth and writes only" token cannot publish). Add it as
      the `NPM_TOKEN` repository secret.
- [ ] **Publish v0.1.0** via the Release workflow — `--dry-run` first, then for real.
      Provenance requires a public repo plus Actions OIDC, so this **must** follow the flip or
      0.1.0 loses provenance permanently.
- [ ] **Switch the README install section** from source to `npx @nitin27may/mcpgen`, and add the
      `0.1.0` section to `CHANGELOG.md`.

### Deliberately still open

- **`upstreamAuthentication.tokenUrl` is a plain string, not a binding**, so a config cannot
  move between environments without editing. Documented as a known limitation in the README and
  `docs/CONFIG.md`. Cheaper to change before 0.1.0 than after, since `schemaVersion` is the
  published compatibility contract — but it is a deliberate decision, not an oversight.
- **Coverage thresholds, CodeQL, OpenSSF Scorecard** — post-flip.
- **`P1-W13-T01` cancellation propagation** — post-flip; disclosed as a known limitation.
- **README screenshots / demo GIF** — the two hero images exist and are used by the web app but
  not by the README.
