import { classifyApi } from '@mcpgen/risk-engine';
import { fail, ok } from '@/server/http';
import { buildOperationDetail } from '@/server/operation-detail';
import { buildOperationSummaries } from '@/server/operations';
import { InvalidIdError } from '@/server/paths';
import { readProjectAnalysis, readProjectCanonicalApi, readProjectConfig, readProjectRecord, readProjectSourceMeta } from '@/server/project-store';
import { buildProjectSnapshot } from '@/server/snapshot';

export async function GET(request: Request, ctx: RouteContext<'/api/projects/[id]'>): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const include = new Set(url.searchParams.get('include')?.split(',') ?? []);
  const operationId = url.searchParams.get('operationId');

  if (include.has('operationDetail') && operationId === null) {
    return fail([{ code: 'CFG-001', message: '`operationId` is required when `include` contains "operationDetail"', category: 'VALIDATION' }], 400);
  }

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

  const operations = include.has('operations') ? buildOperationSummaries(canonicalApi, classifyApi(canonicalApi), analysis?.readiness) : undefined;

  let operationDetail;
  if (include.has('operationDetail') && operationId !== null) {
    const operation = canonicalApi.operations.find((op) => op.id === operationId);
    if (!operation) return fail([{ code: 'IMP-008', message: `No operation "${operationId}" on this project`, category: 'IMPORT' }], 404);
    operationDetail = buildOperationDetail(operation, canonicalApi, config);
  }

  const snapshot = await buildProjectSnapshot(record, config, canonicalApi, sourceMeta, { analysis, operations, operationDetail });
  return ok(snapshot);
}
