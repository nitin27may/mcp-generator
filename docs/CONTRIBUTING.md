# Contributing

Building from source and running the pieces locally. If you only want to *use* `mcpgen`, see the
root [`README.md`](../README.md) instead — this file is for working on the repo itself.

## Setup

```bash
git clone https://github.com/nitin27may/mcp-generator.git
cd mcp-generator
pnpm install
pnpm build
```

Requires Node.js ≥ 22.11 and pnpm 11.22 (`corepack enable` picks up the pinned version
automatically — see `packageManager` in the root `package.json`).

## Verification chain

```bash
pnpm lint && pnpm build && pnpm test && pnpm run test:integration && pnpm run test:security
pnpm --filter @mcpgen/web exec playwright test
```

Run this before opening a PR. `pnpm lint` includes `lint:boundaries`, which enforces the package
dependency rules in `docs/adr/` (e.g. no package outside `apps/cli` may import from `apps/*`).

## Linking the CLI locally

```bash
cd apps/cli
npm link          # exposes a global `mcpgen` command backed by this build
cd ../..
```

If `npm link` fails with a permissions error, some systems' global npm prefix isn't user-writable.
Either fix npm's global prefix, or run it scoped to a writable one:

```bash
npm_config_prefix=$HOME/.npm-global npm link
```

(and add `$HOME/.npm-global/bin` to `PATH`.)

## Publishing to npm — TODO, not yet live

`scripts/release.sh` builds, verifies, and packs `@nitin27may/mcpgen` (the only package this repo
ever publishes — every `@mcpgen/*` workspace package stays `private: true` forever, not just for
now). It is fully working for local proof — packing and installing the tarball exactly as a real
npm consumer would — but the actual `npm publish` step has never been run against the real
registry. Before it can be:

1. Create a granular npm access token scoped to `@nitin27may/*`.
2. Set the npm account's 2FA mode to **"auth and publish"** or **"auth only"** — not "auth and
   writes only" for automation, since a bare token cannot publish under that mode.
3. `npm login` locally, or export `NPM_TOKEN` for the eventual CI workflow (not yet built — see
   below).

Until then, always run with `--dry-run` or `--pack-only`:

```bash
scripts/release.sh 0.1.0 --dry-run     # runs npm publish --dry-run, never a real publish
scripts/release.sh 0.1.0 --pack-only   # stops after npm pack — no publish attempt at all
```

Both stage a real publish manifest (`apps/cli/publish/package.template.json` → `apps/cli/dist-npm/
package.json`, version substituted), run `npm pack`, and install the *real tarball* into a scratch
directory to prove it works standalone — the same proof a real `npm install -g @nitin27may/mcpgen`
would need, without touching the real registry.

There is deliberately no GitHub Actions release workflow yet either — Actions credit is exhausted
this month. `scripts/release.sh` is written so that a future `workflow_dispatch`-only workflow can
just call it directly, with no separate CI-only logic to keep in sync.

## Running the web wizard

```bash
pnpm --filter @mcpgen/web dev
```

Projects are stored under an ephemeral, disk-backed workspace (`MCPGEN_WORKSPACE_ROOT`, default
`$TMPDIR/mcpgen-workspace`) — no accounts, no database. The full environment variable list is in
[`apps/web/src/server/env.ts`](../apps/web/src/server/env.ts).
