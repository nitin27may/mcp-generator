import { AnalyzeRequestSchema } from '@mcpgen/control-contracts';
import { performAnalyze } from '@/server/analyze';
import { fail, invalidJsonBody, ok } from '@/server/http';
import { InvalidIdError } from '@/server/paths';
import { readProjectCanonicalApi, readProjectRecord, readProjectSourceMeta } from '@/server/project-store';

export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/analyze'>): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonBody();
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
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

  const [canonicalApi, sourceMeta] = await Promise.all([
    readProjectCanonicalApi(id, record.currentSourceVersion),
    readProjectSourceMeta(id, record.currentSourceVersion),
  ]);
  if (!canonicalApi || !sourceMeta) {
    return fail([{ code: 'IMP-008', message: `Project "${id}" is missing required files on disk`, category: 'IMPORT' }], 500);
  }

  const analysis = await performAnalyze(id, record.currentSourceVersion, canonicalApi, sourceMeta.rawFingerprint, parsed.data.force ?? false);
  return ok(analysis);
}
