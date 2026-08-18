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

## Running the web wizard

```bash
pnpm --filter @mcpgen/web dev
```

Projects are stored under an ephemeral, disk-backed workspace (`MCPGEN_WORKSPACE_ROOT`, default
`$TMPDIR/mcpgen-workspace`) — no accounts, no database. The full environment variable list is in
[`apps/web/src/server/env.ts`](../apps/web/src/server/env.ts).
