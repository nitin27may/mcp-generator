import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateProject } from './generate.js';
import { config, operation, tool } from './test-helpers.js';

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function newTempDir(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'mcpgen-generate-'));
  return dir;
}

describe('generateProject — BR-001, generation blocked on unresolved operation reference', () => {
  it('blocks generation and writes nothing when a tool references a missing operation', async () => {
    const target = await newTempDir();
    const result = await generateProject({ config: config(), operations: {} }, target);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'GEN-004' });
    expect(result.outputDir).toBeUndefined();

    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('does not block on a disabled tool referencing a missing operation', async () => {
    const target = await newTempDir();
    const result = await generateProject(
      { config: config({ tools: { get_customer: tool({ enabled: false }) } }), operations: {} },
      target,
    );
    expect(result.diagnostics).toEqual([]);
  });
});

describe('generateProject — file output', () => {
  it('writes every expected file for a config with emitDockerfile: true', async () => {
    const target = await newTempDir();
    const result = await generateProject({ config: config(), operations: { getCustomer: operation() } }, target);

    expect(result.diagnostics).toEqual([]);
    expect(result.outputDir).toBe(target);

    for (const file of ['package.json', 'mcp.config.json', 'generated-manifest.json', '.env.example', '.gitignore', 'README.md', 'Dockerfile', 'dist/cli.mjs']) {
      await expect(readFile(join(target, file), 'utf8')).resolves.toBeTruthy();
    }
  });

  it('omits Dockerfile when emitDockerfile is false', async () => {
    const target = await newTempDir();
    await generateProject(
      { config: config({ generation: { ...config().generation, emitDockerfile: false } }), operations: { getCustomer: operation() } },
      target,
    );
    await expect(readFile(join(target, 'Dockerfile'))).rejects.toThrow();
  });

  it('the shipped mcp.config.json round-trips through the real schema validator', async () => {
    const target = await newTempDir();
    await generateProject({ config: config(), operations: { getCustomer: operation() } }, target);
    const written = JSON.parse(await readFile(join(target, 'mcp.config.json'), 'utf8'));
    expect(written).toEqual(config());
  });

  it('generated-manifest.json contains only the operations actually referenced by enabled tools', async () => {
    const target = await newTempDir();
    await generateProject(
      { config: config(), operations: { getCustomer: operation(), unused: operation({ id: 'unused', operationId: 'unused' }) } },
      target,
    );
    const manifest = JSON.parse(await readFile(join(target, 'generated-manifest.json'), 'utf8'));
    expect(manifest.operations.map((o: { id: string }) => o.id)).toEqual(['getCustomer']);
  });

  it('the bundled dist/cli.mjs never references an unpublished @mcpgen package', async () => {
    const target = await newTempDir();
    await generateProject({ config: config(), operations: { getCustomer: operation() } }, target);
    const bundle = await readFile(join(target, 'dist/cli.mjs'), 'utf8');
    expect(bundle).not.toContain('@mcpgen');
  });

  it('the bundled dist/cli.mjs has exactly one shebang line', async () => {
    const target = await newTempDir();
    await generateProject({ config: config(), operations: { getCustomer: operation() } }, target);
    const bundle = await readFile(join(target, 'dist/cli.mjs'), 'utf8');
    expect(bundle.match(/^#!\/usr\/bin\/env node$/gm)).toHaveLength(1);
  });
});
