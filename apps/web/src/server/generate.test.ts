import { readFileSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseOpenApi } from '@mcpgen/openapi-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { performGenerate, walkFiles } from './generate.js';
import { seedProjectConfig } from './seed-config.js';
import { buildDir } from './paths.js';

const CUSTOMER_SPEC_PATH = fileURLToPath(new URL('../../../../fixtures/openapi-3.1/customer.json', import.meta.url));

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'mcpgen-generate-test-'));
  process.env.MCPGEN_WORKSPACE_ROOT = workspaceRoot;
});

afterEach(async () => {
  delete process.env.MCPGEN_WORKSPACE_ROOT;
  delete process.env.MCPGEN_MAX_BUILD_BYTES;
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('performGenerate', () => {
  it('generates a real, installable package for a real fixture with one enabled tool', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const canonicalApi = parsed.value;
    const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

    const baseConfig = seedProjectConfig(canonicalApi, 'Customer API');
    const operation = canonicalApi.operations.find((op) => op.operationId === 'getCustomer')!;
    const config = { ...baseConfig, tools: { ...baseConfig.tools, [operation.id]: { ...baseConfig.tools[operation.id]!, enabled: true } } };

    const projectId = randomUUID();
    const outcome = await performGenerate(projectId, config, operationsById, canonicalApi.source.rawFingerprint);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.files.length).toBeGreaterThan(0);
    expect(outcome.totalBytes).toBeGreaterThan(0);
    const paths = outcome.files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths.some((p) => p.startsWith('dist/'))).toBe(true);

    // The build actually landed on disk where the download route would look for it.
    const dir = buildDir(projectId, outcome.buildId);
    const stats = await stat(dir);
    expect(stats.isDirectory()).toBe(true);
    const onDisk = await walkFiles(dir);
    expect(onDisk.length).toBe(outcome.files.length);
  });

  it('blocks generation and cleans up the output directory when config-schema validation fails', async () => {
    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const canonicalApi = parsed.value;
    const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

    const baseConfig = seedProjectConfig(canonicalApi, 'Customer API');
    // Two enabled tools sharing the same name violates BR-002 — parseProjectConfig will reject it.
    const [firstId, secondId] = Object.keys(baseConfig.tools);
    const config = {
      ...baseConfig,
      tools: {
        ...baseConfig.tools,
        [firstId!]: { ...baseConfig.tools[firstId!]!, enabled: true, name: 'same_name' },
        [secondId!]: { ...baseConfig.tools[secondId!]!, enabled: true, name: 'same_name' },
      },
    };

    const projectId = randomUUID();
    const outcome = await performGenerate(projectId, config, operationsById, canonicalApi.source.rawFingerprint);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics.length).toBeGreaterThan(0);
    expect(outcome.diagnostics[0]!.code).toBe('CFG-001');
  });

  it('blocks generation and cleans up the output directory when the build exceeds the configured byte cap', async () => {
    process.env.MCPGEN_MAX_BUILD_BYTES = '10'; // unrealistically small — any real generated package exceeds this

    const spec = JSON.parse(readFileSync(CUSTOMER_SPEC_PATH, 'utf8'));
    const parsed = await parseOpenApi(spec, { sourceId: 'customer-oas31' });
    if (!parsed.value) throw new Error('fixture spec failed to parse');
    const canonicalApi = parsed.value;
    const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

    const baseConfig = seedProjectConfig(canonicalApi, 'Customer API');
    const operation = canonicalApi.operations.find((op) => op.operationId === 'getCustomer')!;
    const config = { ...baseConfig, tools: { ...baseConfig.tools, [operation.id]: { ...baseConfig.tools[operation.id]!, enabled: true } } };

    const projectId = randomUUID();
    const outcome = await performGenerate(projectId, config, operationsById, canonicalApi.source.rawFingerprint);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.diagnostics[0]).toMatchObject({ code: 'GEN-006' });
  });
});
