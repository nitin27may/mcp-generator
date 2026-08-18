import { isStageOk } from '@mcpgen/domain';
import { parseProjectConfig } from '@mcpgen/config-schema';
import { diagnosticToProductError, UpdateConfigRequestSchema } from '@mcpgen/control-contracts';
import { conflict, fail, invalidJsonBody, ok } from '@/server/http';
import { InvalidIdError } from '@/server/paths';
import { readProjectCanonicalApi, readProjectRecord, readProjectSourceMeta, updateProjectConfig } from '@/server/project-store';
import { buildProjectSnapshot } from '@/server/snapshot';

export async function PUT(request: Request, ctx: RouteContext<'/api/projects/[id]/config'>): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonBody();
  }

  const parsedRequest = UpdateConfigRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return fail(
      parsedRequest.error.issues.map((issue) => ({ code: 'CFG-001', message: issue.message, category: 'VALIDATION' as const })),
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

  // Re-validate even though the client-side draft was built from a parsed config — the wire body
  // is untrusted input regardless of what produced it, and `.strict()` schemas plus BR-002's
  // enabled-name-uniqueness check both need to run server-side before anything is persisted.
  const parsedConfig = parseProjectConfig(parsedRequest.data.config);
  if (!isStageOk(parsedConfig)) {
    return fail(parsedConfig.diagnostics.map(diagnosticToProductError), 422);
  }

  const updateResult = await updateProjectConfig(id, parsedRequest.data.expectedRevision, parsedConfig.value);
  if (!updateResult.ok) return conflict(updateResult.serverRevision);

  const [canonicalApi, sourceMeta] = await Promise.all([
    readProjectCanonicalApi(id, updateResult.record.currentSourceVersion),
    readProjectSourceMeta(id, updateResult.record.currentSourceVersion),
  ]);
  if (!canonicalApi || !sourceMeta) {
    return fail([{ code: 'IMP-008', message: `Project "${id}" is missing required files on disk`, category: 'IMPORT' }], 500);
  }

  const snapshot = await buildProjectSnapshot(updateResult.record, parsedConfig.value, canonicalApi, sourceMeta);
  return ok(snapshot);
}
