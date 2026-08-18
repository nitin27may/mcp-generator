import { CreateProjectRequestSchema } from '@mcpgen/control-contracts';
import { fail, invalidJsonBody, ok } from '@/server/http';
import { createProject, readStaging } from '@/server/project-store';
import { seedProjectConfig } from '@mcpgen/config-seed';
import { buildProjectSnapshot } from '@/server/snapshot';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonBody();
  }

  const parsed = CreateProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((issue) => ({ code: 'CFG-001', message: issue.message, category: 'VALIDATION' as const })),
      400,
    );
  }

  const staging = await readStaging(parsed.data.importId);
  if (!staging) {
    return fail([{ code: 'IMP-008', message: `No staged import "${parsed.data.importId}" (it may have expired)`, category: 'IMPORT' }], 404);
  }

  const name = parsed.data.name ?? staging.canonicalApi.info.title ?? 'Untitled project';
  const config = seedProjectConfig(staging.canonicalApi, name);

  const record = await createProject({ name, rawText: staging.rawText, canonicalApi: staging.canonicalApi, meta: staging.meta, config });
  const snapshot = await buildProjectSnapshot(record, config, staging.canonicalApi, staging.meta);

  return ok(snapshot, [], 201);
}
