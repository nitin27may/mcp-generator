import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { generateProject } from '@mcpgen/generator';
import { parseProjectConfig } from '@mcpgen/config-schema';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation, Diagnostic } from '@mcpgen/domain';
import { isStageOk } from '@mcpgen/domain';
import type { GeneratedFile } from '@mcpgen/control-contracts';
import { getEnv } from './env';
import { buildDir, buildsRoot } from './paths';

export type GenerateOutcome =
  | { readonly ok: true; readonly buildId: string; readonly files: readonly GeneratedFile[]; readonly totalBytes: number }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** Recursively lists every file under `dir`, paths relative to `dir` — used both to build the wire `files` manifest and to enumerate what the download route zips. */
export async function walkFiles(dir: string, root: string = dir): Promise<GeneratedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: GeneratedFile[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath, root)));
    } else if (entry.isFile()) {
      const stats = await stat(fullPath);
      files.push({ path: relative(root, fullPath), sizeBytes: stats.size });
    }
  }
  return files;
}

/**
 * Config re-validated here for the same reason `PUT /config` re-validates
 * on the wire: the on-disk config is schema-valid by construction, but
 * trusting that invariant silently across a route boundary is how it stops
 * being true. `generateProject` itself is untouched — this wraps it, it
 * doesn't reimplement any part of it (R5).
 */
export async function performGenerate(
  projectId: string,
  config: McpProjectConfig,
  operationsById: Readonly<Record<string, CanonicalOperation>>,
  sourceFingerprint: string,
): Promise<GenerateOutcome> {
  const parsed = parseProjectConfig(config);
  if (!isStageOk(parsed)) return { ok: false, diagnostics: parsed.diagnostics };

  const buildId = randomUUID();
  await mkdir(buildsRoot(projectId), { recursive: true });
  const outputDir = buildDir(projectId, buildId);

  const result = await generateProject({ config: parsed.value, operations: operationsById, sourceFingerprint }, outputDir);
  if (!result.outputDir) {
    await rm(outputDir, { recursive: true, force: true });
    return { ok: false, diagnostics: result.diagnostics };
  }

  const files = await walkFiles(outputDir);
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const maxBytes = getEnv().MCPGEN_MAX_BUILD_BYTES;

  if (totalBytes > maxBytes) {
    await rm(outputDir, { recursive: true, force: true });
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'GEN-006',
          message: `Generated package is ${totalBytes} bytes, exceeding the ${maxBytes}-byte cap`,
        },
      ],
    };
  }

  return { ok: true, buildId, files, totalBytes };
}
