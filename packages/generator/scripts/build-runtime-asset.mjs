#!/usr/bin/env node
// Runs after tsc, bundling the already-compiled dist/runtime-entry/cli.js into a single
// dist/runtime-cli.mjs — the exact artifact every `generate()` call now just copies (bundle.ts),
// instead of invoking esbuild fresh per generated project. See bundle.ts's header comment for why:
// generation no longer needs esbuild as a runtime dependency at all.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'dist', 'runtime-entry', 'cli.js');
const outfile = join(here, '..', 'dist', 'runtime-cli.mjs');

// Real, published SDK packages stay external (installed via package-json.ts's dependencies);
// everything else — our own workspace code — gets inlined.
const EXTERNAL_PACKAGES = ['@modelcontextprotocol/core', '@modelcontextprotocol/server', '@modelcontextprotocol/node', 'zod'];

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  external: EXTERNAL_PACKAGES,
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'silent',
});

if (result.errors.length > 0) {
  console.error(`esbuild failed to bundle the runtime: ${JSON.stringify(result.errors)}`);
  process.exit(1);
}

await import('node:fs/promises').then((fs) => fs.chmod(outfile, 0o755));
