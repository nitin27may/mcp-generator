import { GenerateRequestSchema, diagnosticToProductError, type GenerateResult } from '@mcpgen/control-contracts';
import { fail, ok } from '@/server/http';
import { InvalidIdError } from '@/server/paths';
import { performGenerate } from '@/server/generate';
import { readProjectCanonicalApi, readProjectConfig, readProjectRecord } from '@/server/project-store';

export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/generate'>): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((issue) => ({ code: 'CFG-001', message: issue.message, category: 'VALIDATION' as const })),
      400,
    );
  }

  let record;
  try {
    record = await readProjectRecord(id);
  } catch (error) {
    if (error instanceof InvalidIdError) return fail([{ code: 'CFG-001', message: error.message, category: 'VALIDATION' }], 400);
    throw error;
  }
  if (!record) return fail([{ code: 'IMP-008', message: `No project "${id}"`, category: 'IMPORT' }], 404);

  if (parsed.data.expectedRevision !== undefined && parsed.data.expectedRevision !== record.configRevision) {
    return fail(
      [{ code: 'CFG-002', message: `Configuration was changed by another session (server is at revision ${record.configRevision})`, category: 'VALIDATION' }],
      409,
    );
  }

  const [config, canonicalApi] = await Promise.all([readProjectConfig(id), readProjectCanonicalApi(id, record.currentSourceVersion)]);
  if (!config || !canonicalApi) {
    return fail([{ code: 'IMP-008', message: `Project "${id}" is missing required files on disk`, category: 'IMPORT' }], 500);
  }
  const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

  const outcome = await performGenerate(id, config, operationsById, canonicalApi.source.rawFingerprint);
  if (!outcome.ok) {
    return fail(outcome.diagnostics.map(diagnosticToProductError), 422);
  }

  const result: GenerateResult = {
    buildId: outcome.buildId,
    files: outcome.files,
    totalBytes: outcome.totalBytes,
    downloadUrl: `/api/projects/${id}/generate/${outcome.buildId}/download`,
  };
  return ok(result);
}
