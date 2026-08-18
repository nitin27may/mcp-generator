import { fail, ok } from '@/server/http';
import { InvalidIdError } from '@/server/paths';
import { readProjectAnalysis, readProjectCanonicalApi, readProjectConfig, readProjectRecord, readProjectSourceMeta } from '@/server/project-store';
import { buildProjectSnapshot } from '@/server/snapshot';

export async function GET(request: Request, ctx: RouteContext<'/api/projects/[id]'>): Promise<Response> {
  const { id } = await ctx.params;
  const include = new Set(new URL(request.url).searchParams.get('include')?.split(',') ?? []);

  let record;
  try {
    record = await readProjectRecord(id);
  } catch (error) {
    if (error instanceof InvalidIdError) return fail([{ code: 'CFG-001', message: error.message, category: 'VALIDATION' }], 400);
    throw error;
  }
  if (!record) return fail([{ code: 'IMP-008', message: `No project "${id}"`, category: 'IMPORT' }], 404);

  const [config, canonicalApi, sourceMeta, analysis] = await Promise.all([
    readProjectConfig(id),
    readProjectCanonicalApi(id, record.currentSourceVersion),
    readProjectSourceMeta(id, record.currentSourceVersion),
    include.has('analysis') ? readProjectAnalysis(id, record.currentSourceVersion) : Promise.resolve(undefined),
  ]);
  if (!config || !canonicalApi || !sourceMeta) {
    return fail([{ code: 'IMP-008', message: `Project "${id}" is missing required files on disk`, category: 'IMPORT' }], 500);
  }

  const snapshot = await buildProjectSnapshot(record, config, canonicalApi, sourceMeta, { analysis });
  return ok(snapshot);
}
