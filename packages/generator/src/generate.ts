import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { CanonicalOperation, Diagnostic } from '@mcpgen/domain';
import { bundleRuntime } from './bundle.js';
import { buildDockerfile } from './dockerfile.js';
import { buildEnvExample } from './env-example.js';
import { GITIGNORE_CONTENT } from './gitignore.js';
import { buildGenerationManifest } from './manifest.js';
import { buildPackageJson } from './package-json.js';
import { buildReadme } from './readme.js';

export interface GenerateProjectInput {
  readonly config: McpProjectConfig;
  readonly operations: Readonly<Record<string, CanonicalOperation>>;
  readonly sourceFingerprint?: string;
}

export interface GenerateProjectResult {
  readonly diagnostics: Diagnostic[];
  readonly outputDir?: string;
}

/**
 * TIP §29/§30. Self-contained mode: bundles our runtime into dist/cli.mjs
 * (bundle.ts) rather than depending on unpublished @mcpgen/* packages —
 * see package-json.ts's header comment for why thin mode isn't viable yet.
 * Deterministic except `generatedAt` (TIP §39): the same config and
 * operations produce byte-identical output otherwise.
 */
export async function generateProject(input: GenerateProjectInput, outputDir: string): Promise<GenerateProjectResult> {
  const { config } = input;

  const referencedOperations: CanonicalOperation[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [key, tool] of Object.entries(config.tools)) {
    if (!tool.enabled) continue;
    const operation = input.operations[tool.sourceOperation.internalOperationId];
    if (!operation) {
      // BR-001: no generated tool may reference an unresolved operation.
      diagnostics.push({
        severity: 'error',
        code: 'GEN-004',
        message: `Tool "${key}" references operation "${tool.sourceOperation.internalOperationId}", which was not found — generation blocked`,
        sourcePointer: `#/tools/${key}/sourceOperation`,
      });
      continue;
    }
    referencedOperations.push(operation);
  }
  if (diagnostics.length > 0) return { diagnostics };

  const manifest = buildGenerationManifest(config, referencedOperations, input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {});

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'package.json'), `${JSON.stringify(buildPackageJson(config), null, 2)}\n`);
  await writeFile(join(outputDir, 'mcp.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(join(outputDir, 'generated-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outputDir, '.env.example'), buildEnvExample(config));
  await writeFile(join(outputDir, '.gitignore'), GITIGNORE_CONTENT);
  await writeFile(join(outputDir, 'README.md'), buildReadme(config, manifest));
  if (config.generation.emitDockerfile) {
    await writeFile(join(outputDir, 'Dockerfile'), buildDockerfile(config));
  }

  await mkdir(join(outputDir, 'dist'), { recursive: true });
  await bundleRuntime(join(outputDir, 'dist', 'cli.mjs'));

  return { diagnostics: [], outputDir };
}
