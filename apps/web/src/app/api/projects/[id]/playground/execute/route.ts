import { ExecuteRequestSchema } from '@mcpgen/control-contracts';
import { fail, invalidJsonBody, ok } from '@/server/http';
import { getEnv } from '@/server/env';
import { InvalidIdError } from '@/server/paths';
import { performExecute } from '@/server/execute';
import { readProjectCanonicalApi, readProjectConfig, readProjectRecord } from '@/server/project-store';

export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/playground/execute'>): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonBody();
  }

  const parsed = ExecuteRequestSchema.safeParse(body);
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

  const [config, canonicalApi] = await Promise.all([readProjectConfig(id), readProjectCanonicalApi(id, record.currentSourceVersion)]);
  if (!config || !canonicalApi) {
    return fail([{ code: 'IMP-008', message: `Project "${id}" is missing required files on disk`, category: 'IMPORT' }], 500);
  }
  const operationsById = Object.fromEntries(canonicalApi.operations.map((op) => [op.id, op]));

  const outcome = await performExecute(
    config,
    operationsById,
    parsed.data.toolName,
    parsed.data.input,
    parsed.data.env,
    parsed.data.secrets,
    parsed.data.acknowledgeRisk,
    getEnv().MCPGEN_ALLOW_PRIVATE_EGRESS,
  );

  if (!outcome.ok) {
    switch (outcome.kind) {
      case 'tool-not-found':
        return fail([{ code: 'MCP-001', message: `Tool "${parsed.data.toolName}" not found`, category: 'MCP' }], 404);
      case 'risk-not-acknowledged':
        return fail(
          [{ code: 'PLG-001', message: 'This tool is Destructive or Privileged and requires explicit acknowledgement before it runs', category: 'SECURITY' }],
          428,
        );
      case 'egress-blocked':
        return fail([{ code: 'PLG-002', message: outcome.message, category: 'SECURITY' }], 403);
      case 'base-url-unresolved':
        return fail([{ code: 'BND-005', message: outcome.message, category: 'BINDING' }], 422);
    }
  }

  return ok(outcome.trace);
}
