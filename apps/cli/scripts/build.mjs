#!/usr/bin/env node
// Bundles apps/cli into a single self-contained ESM file, mirroring
// packages/generator/scripts/build-runtime-asset.mjs so the repo has one bundling pattern
// instead of two. This is what makes `apps/cli` publishable at all: its `dist/` used to be a
// plain tsc mirror of `src/`, keeping bare `@mcpgen/*` imports intact — fine inside this
// monorepo's pnpm workspace, broken the instant it's installed anywhere else, since those nine
// packages are `private: true` and never published.
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outdir = join(root, 'dist');

// The exact same list packages/generator/src/package-json.ts emits as the generated package's own
// dependencies — real, published SDK packages plus zod stay external; every `@mcpgen/*` workspace
// package gets inlined. Keeping zod external (rather than bundling ours) matters: the SDK
// external-imports its own zod, and two copies in one process would straddle `fromJsonSchema`.
const EXTERNAL_PACKAGES = ['@modelcontextprotocol/core', '@modelcontextprotocol/server', '@modelcontextprotocol/node', 'zod'];

await mkdir(outdir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(root, 'src', 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(outdir, 'mcpgen.mjs'),
  external: EXTERNAL_PACKAGES,
  // Bundled CJS dependencies (openapi-adapter's `yaml` parser, pulled in transitively) call
  // Node's real `require()` for built-ins like `process` at runtime — esbuild's own CJS-into-ESM
  // interop shim can't satisfy that inside a pure `.mjs` bundle (found by actually running the
  // bundle: "Dynamic require of \"process\" is not supported"), so a real `require` needs to
  // exist. `createRequire` is the standard fix. Not a shebang duplicate: esbuild auto-detects and
  // preserves src/cli.ts's own `#!/usr/bin/env node` as the output's first line regardless of
  // `banner` content, inserting this banner text immediately after it.
  banner: { js: "import { createRequire as __mcpgenCreateRequire } from 'node:module';\nconst require = __mcpgenCreateRequire(import.meta.url);" },
  define: { __MCPGEN_VERSION__: JSON.stringify(process.env.MCPGEN_VERSION ?? '0.0.0-dev') },
  logLevel: 'silent',
  metafile: true,
});

if (result.errors.length > 0) {
  process.stderr.write(`esbuild failed to bundle the CLI: ${JSON.stringify(result.errors)}\n`);
  process.exit(1);
}

// @scalar/openapi-parser and @scalar/json-magic (pulled in transitively via @mcpgen/openapi-adapter)
// are pure JS with no native deps, so they get bundled too — but only the four functions the
// adapter actually imports (normalize/dereference/upgrade/validate). Verify neither of the
// parser's network/filesystem-reading plugin subpaths made it in: a published CLI must never carry
// code that fetches remote $refs or reads arbitrary files, even dormant and unreachable from this
// CLI's own call sites — reachable-but-dead code in a security-sensitive area is exactly the kind
// of thing that gets accidentally wired up later.
const inputs = Object.keys(result.metafile.inputs);
const forbidden = inputs.filter((f) => /@scalar\/openapi-parser\/dist\/plugins\/(fetch-urls|read-files)/.test(f));
if (forbidden.length > 0) {
  process.stderr.write(`Forbidden modules made it into the CLI bundle: ${forbidden.join(', ')}\n`);
  process.exit(1);
}

// The runtime asset @mcpgen/generator's own build already produced (build-runtime-asset.mjs) has
// to ship as a real sibling file — bundle.ts's copy-time resolution (see its own doc comment)
// needs it on disk relative to THIS bundle's own location, since @mcpgen/generator's dist/ won't
// exist once this file is the only thing installed.
const generatorRuntimeAsset = join(root, '..', '..', 'packages', 'generator', 'dist', 'runtime-cli.mjs');
await copyFile(generatorRuntimeAsset, join(outdir, 'runtime-cli.mjs'));
await chmod(join(outdir, 'runtime-cli.mjs'), 0o755);
await chmod(join(outdir, 'mcpgen.mjs'), 0o755);
