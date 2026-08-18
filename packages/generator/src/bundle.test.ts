import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundleRuntime } from './bundle.js';

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('bundleRuntime', () => {
  it('copies the asset at the given path to the output file and makes it executable', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-bundle-test-'));
    const assetPath = join(dir, 'source-runtime.mjs');
    const outFile = join(dir, 'dist', 'cli.mjs');
    await writeFile(assetPath, '#!/usr/bin/env node\nconsole.log("hi");\n');
    await mkdir(join(dir, 'dist'));

    await bundleRuntime(outFile, assetPath);

    expect(await readFile(outFile, 'utf8')).toBe('#!/usr/bin/env node\nconsole.log("hi");\n');
    const mode = (await stat(outFile)).mode & 0o777;
    expect(mode & 0o100).toBe(0o100); // owner-executable
  });

  it('raises a clear, actionable error — not a bare ENOENT — when the asset is missing', async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcpgen-bundle-test-'));
    const missingAsset = join(dir, 'does-not-exist.mjs');
    const outFile = join(dir, 'dist', 'cli.mjs');

    await expect(bundleRuntime(outFile, missingAsset)).rejects.toThrow(/pnpm build/);
  });
});
