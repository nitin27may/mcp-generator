import { chmod, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The runtime bundle esbuild produces does not depend on the project being generated — it's the
 * same `runtime-entry/cli.ts` inlined every time. So it's a build-time asset
 * (`scripts/build-runtime-asset.mjs`, run once as part of this package's own `build`), not
 * something esbuild re-bundles on every `generate()` call. This function just copies it into
 * place. Wins beyond the obvious speedup: generation is now byte-deterministic across machines
 * (no esbuild version/platform variance per call), and `esbuild` itself drops to a devDependency —
 * neither `@mcpgen/generator`'s own consumers nor a package built from its output need the ~10 MB
 * native binary at runtime.
 *
 * `assetPath` is an explicit parameter, not always the default computed from `import.meta.url` —
 * once this module is inlined into a bundled CLI (apps/cli's own npm-published bundle), its
 * `import.meta.url` becomes that CLI bundle's path, not this package's `dist/`, so a caller in
 * that position must resolve and pass the real path itself.
 */
export async function bundleRuntime(outFile: string, assetPath?: string): Promise<void> {
  const resolvedAssetPath = assetPath ?? join(dirname(fileURLToPath(import.meta.url)), 'runtime-cli.mjs');

  try {
    await copyFile(resolvedAssetPath, outFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Runtime asset not found at "${resolvedAssetPath}". @mcpgen/generator's own build ` +
          `(scripts/build-runtime-asset.mjs) produces it — run "pnpm build" before generating a project.`,
        { cause: error },
      );
    }
    throw error;
  }

  await chmod(outFile, 0o755);
}
