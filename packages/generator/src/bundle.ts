import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), 'runtime-entry', 'cli.js');

/** Real, published SDK packages stay external (installed via package-json.ts's dependencies); everything else — our own workspace code — gets inlined. */
const EXTERNAL_PACKAGES = ['@modelcontextprotocol/core', '@modelcontextprotocol/server', '@modelcontextprotocol/node', 'zod'];

export async function bundleRuntime(outFile: string): Promise<void> {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: outFile,
    external: EXTERNAL_PACKAGES,
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'silent',
  });

  if (result.errors.length > 0) {
    throw new Error(`esbuild failed to bundle the runtime: ${JSON.stringify(result.errors)}`);
  }
}
