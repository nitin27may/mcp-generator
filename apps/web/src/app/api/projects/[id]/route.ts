import { fail, ok } from '@/server/http';
import { InvalidIdError } from '@/server/paths';
import { readProjectCanonicalApi, readProjectConfig, readProjectRecord, readProjectSourceMeta } from '@/server/project-store';
import { buildProjectSnapshot } from '@/server/snapshot';

export async function GET(_request: Request, ctx: RouteContext<'/api/projects/[id]'>): Promise<Response> {
  const { id } = await ctx.params;

  let record;
  try {
    record = await readProjectRecord(id);
  } catch (error) {
    if (error instanceof InvalidIdError) return fail([{ code: 'CFG-001', message: error.message, category: 'VALIDATION' }], 400);
    throw error;
  }
  if (!record) return fail([{ code: 'IMP-008', message: `No project "${id}"`, category: 'IMPORT' }], 404);

  const [config, canonicalApi, sourceMeta] = await Promise.all([
    readProjectConfig(id),
    readProjectCanonicalApi(id, record.currentSourceVersion),
    readProjectSourceMeta(id, record.currentSourceVersion),
  ]);
  if (!config || !canonicalApi || !sourceMeta) {
    return fail([{ code: 'IMP-008', message: `Project "${id}" is missing required files on disk`, category: 'IMPORT' }], 500);
  }

  const snapshot = await buildProjectSnapshot(record, config, canonicalApi, sourceMeta);
  return ok(snapshot);
}
