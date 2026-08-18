import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { ProjectAnalysis } from '@mcpgen/control-contracts';
import type { CanonicalApi } from '@mcpgen/domain';
import { getEnv } from './env';
import { projectDir, stagingDir, stagingRoot, workspaceRoot } from './paths';
import { PROJECT_RECORD_SCHEMA_VERSION, type ProjectRecord, type SourceVersionMeta } from './types';

async function writeAtomic(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `.tmp-${randomBytes(8).toString('hex')}`);
  await writeFile(tmpPath, contents, 'utf8');
  await rename(tmpPath, path); // atomic on the same filesystem — no reader ever observes a partial file
}

function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  return writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export interface StagingRecord {
  readonly importId: string;
  readonly rawText: string;
  readonly canonicalApi: CanonicalApi;
  readonly meta: SourceVersionMeta;
}

/** `POST /api/import` output. Deliberately not a project — a failed parse shouldn't litter the workspace. TTL: `MCPGEN_STAGING_TTL_HOURS`. */
export async function createStaging(input: Omit<StagingRecord, 'importId'>): Promise<string> {
  const importId = randomUUID();
  const dir = stagingDir(importId);
  await writeAtomic(join(dir, 'spec.raw'), input.rawText);
  await writeJsonAtomic(join(dir, 'canonical.json'), input.canonicalApi);
  await writeJsonAtomic(join(dir, 'meta.json'), input.meta);
  return importId;
}

export async function readStaging(importId: string): Promise<StagingRecord | undefined> {
  const dir = stagingDir(importId);
  const meta = await readJson<SourceVersionMeta>(join(dir, 'meta.json'));
  if (!meta) return undefined;
  const canonicalApi = await readJson<CanonicalApi>(join(dir, 'canonical.json'));
  if (!canonicalApi) return undefined;
  const rawText = await readFile(join(dir, 'spec.raw'), 'utf8');
  return { importId, rawText, canonicalApi, meta };
}

export interface CreateProjectInput {
  readonly name: string;
  readonly rawText: string;
  readonly canonicalApi: CanonicalApi;
  readonly meta: SourceVersionMeta;
  readonly config: McpProjectConfig;
}

/** Promotes a staged import into a real project directory (`<workspace>/<projectId>/`, TTL `MCPGEN_PROJECT_TTL_HOURS`) — layout matches TIP §51's D2. */
export async function createProject(input: CreateProjectInput): Promise<ProjectRecord> {
  const id = randomUUID();
  const dir = projectDir(id);
  const now = new Date().toISOString();
  const record: ProjectRecord = {
    schemaVersion: PROJECT_RECORD_SCHEMA_VERSION,
    id,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    configRevision: 1,
    currentSourceVersion: 1,
  };

  await writeAtomic(join(dir, 'source', 'v1', 'spec.raw'), input.rawText);
  await writeJsonAtomic(join(dir, 'source', 'v1', 'meta.json'), input.meta);
  await writeJsonAtomic(join(dir, 'canonical', 'v1.json'), input.canonicalApi);
  await writeJsonAtomic(join(dir, 'config.json'), input.config);
  await writeJsonAtomic(join(dir, 'project.json'), record); // written last — its presence is what "the project exists" means

  return record;
}

export function readProjectRecord(id: string): Promise<ProjectRecord | undefined> {
  return readJson<ProjectRecord>(join(projectDir(id), 'project.json'));
}

export function readProjectConfig(id: string): Promise<McpProjectConfig | undefined> {
  return readJson<McpProjectConfig>(join(projectDir(id), 'config.json'));
}

export function readProjectCanonicalApi(id: string, version: number): Promise<CanonicalApi | undefined> {
  return readJson<CanonicalApi>(join(projectDir(id), 'canonical', `v${version}.json`));
}

export function readProjectSourceMeta(id: string, version: number): Promise<SourceVersionMeta | undefined> {
  return readJson<SourceVersionMeta>(join(projectDir(id), 'source', `v${version}`, 'meta.json'));
}

export async function readProjectSourceRaw(id: string, version: number): Promise<string | undefined> {
  try {
    return await readFile(join(projectDir(id), 'source', `v${version}`, 'spec.raw'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export type UpdateConfigResult = { ok: true; record: ProjectRecord } | { ok: false; serverRevision: number };

/**
 * Best-effort optimistic concurrency (read-check-write, not a file lock) —
 * the realistic conflict without accounts is two browser tabs on the same
 * project, not a distributed multi-writer race, so this is adequate for the
 * ephemeral single-process store (D2). A true mismatch never overwrites
 * `config.json`.
 */
export async function updateProjectConfig(id: string, expectedRevision: number, config: McpProjectConfig): Promise<UpdateConfigResult> {
  const dir = projectDir(id);
  const record = await readJson<ProjectRecord>(join(dir, 'project.json'));
  if (!record) throw new Error(`project "${id}" not found`); // caller already checked existence
  if (record.configRevision !== expectedRevision) return { ok: false, serverRevision: record.configRevision };

  const updated: ProjectRecord = { ...record, configRevision: record.configRevision + 1, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(join(dir, 'config.json'), config);
  await writeJsonAtomic(join(dir, 'project.json'), updated);
  return { ok: true, record: updated };
}

export function readProjectAnalysis(id: string, version: number): Promise<ProjectAnalysis | undefined> {
  return readJson<ProjectAnalysis>(join(projectDir(id), 'analysis', `v${version}.json`));
}

export function writeProjectAnalysis(id: string, version: number, analysis: ProjectAnalysis): Promise<void> {
  return writeJsonAtomic(join(projectDir(id), 'analysis', `v${version}.json`), analysis);
}

async function isExpired(dir: string, ttlHours: number, now: number): Promise<boolean> {
  try {
    const info = await stat(dir);
    return now - info.mtimeMs > ttlHours * 60 * 60 * 1000;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; // already gone — nothing to sweep
    throw error;
  }
}

async function sweepDir(root: string, ttlHours: number): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  const now = Date.now();
  let swept = 0;
  for (const entry of entries) {
    if (entry.startsWith('_')) continue; // e.g. workspaceRoot()'s own _staging/ when sweeping the workspace root itself
    const dir = join(root, entry);
    if (await isExpired(dir, ttlHours, now)) {
      await rm(dir, { recursive: true, force: true });
      swept++;
    }
  }
  return swept;
}

/** TTL sweep — projects and staged imports independently, since they have different TTLs. Run on boot + every 15 min (`instrumentation.ts`). */
export async function sweepExpired(): Promise<{ projectsSwept: number; stagingSwept: number }> {
  const projectsSwept = await sweepDir(workspaceRoot(), getEnv().MCPGEN_PROJECT_TTL_HOURS);
  const stagingSwept = await sweepDir(stagingRoot(), getEnv().MCPGEN_STAGING_TTL_HOURS);
  return { projectsSwept, stagingSwept };
}
