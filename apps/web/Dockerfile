# Builds and runs apps/web in isolation from a pnpm + Turborepo monorepo.
#
# Uses `turbo prune` (Turborepo's own answer to "pnpm workspace + Docker") to produce a
# minimal, install-ready subset of the monorepo for just @mcpgen/web and its real workspace
# dependencies. Deliberately does NOT use Next's `output: 'standalone'` — it was tried and hit
# two separate, real file-tracing gaps: `@swc/helpers`'s `esm/` files (a documented Next.js +
# pnpm issue), and, more fundamentally, @mcpgen/generator's `bundleRuntime` step reads runtime
# template files (packages/generator/dist/runtime-entry/*) by a computed path at request time,
# not via a static `require()` the tracer can see — no amount of manual patching of one missed
# file is going to catch every one of these. Shipping the full built monorepo (with
# devDependencies) trades image size for not playing whack-a-mole with tracer gaps.
#
# Same Debian base for every stage on purpose: esbuild (used internally by that same
# bundleRuntime step) ships a platform-specific native binary, and mixing base-image flavors
# (e.g. building on Debian, running on Alpine/musl) is exactly the kind of thing that builds
# clean and fails silently at runtime.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo prune @mcpgen/web --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
# `turbo prune` only follows package.json dependency edges — tsconfig's `extends` paths into
# `tooling/tsconfig/*.json` aren't part of that graph, so it's copied in separately.
COPY tooling tooling
# --concurrency=1: under this build's I/O characteristics, turbo's default parallelism let a
# dependent package's `tsc` start before its dependency's `tsc` had finished flushing declaration
# files to disk — an intermittent race (reproduced both here and locally), not a dependency-graph
# bug (`turbo run build --dry=json` confirms the graph itself is correct). Serializing here costs
# a few extra seconds on an image build that isn't on any interactive path.
RUN pnpm exec turbo run build --filter=@mcpgen/web... --concurrency=1

FROM base AS runner
RUN groupadd --system --gid 1001 mcpgen \
  && useradd --system --create-home --uid 1001 --gid mcpgen mcpgen
COPY --from=builder /app ./
RUN mkdir -p /data && chown -R mcpgen:mcpgen /data /home/mcpgen
USER mcpgen
ENV HOME=/home/mcpgen

ENV PORT=3000 HOSTNAME=0.0.0.0 MCPGEN_WORKSPACE_ROOT=/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Runs the `next` binary directly rather than through `pnpm --filter ... start` — pnpm 11's
# dependency-status check (run before any recursive script) needs to write state that this
# non-root user can't, and there's no reason to pay for a freshness check on an image whose
# node_modules was just built in the previous stage.
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start"]
