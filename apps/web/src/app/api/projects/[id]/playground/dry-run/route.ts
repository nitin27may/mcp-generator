import { DryRunRequestSchema } from '@mcpgen/control-contracts';
import { fail, invalidJsonBody, ok } from '@/server/http';
import { InvalidIdError } from '@/server/paths';
import { performDryRun } from '@/server/playground';
import { readProjectCanonicalApi, readProjectConfig, readProjectRecord } from '@/server/project-store';

export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/playground/dry-run'>): Promise<Response> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonBody();
  }

  const parsed = DryRunRequestSchema.safeParse(body);
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

  const toolConfig = Object.values(config.tools).find((tool) => tool.enabled && tool.name === parsed.data.toolName);
  if (!toolConfig) {
    return fail([{ code: 'MCP-001', message: `Tool "${parsed.data.toolName}" not found`, category: 'MCP' }], 404);
  }

  const operation = canonicalApi.operations.find((op) => op.id === toolConfig.sourceOperation.internalOperationId);
  if (!operation) {
    return fail(
      [{ code: 'GEN-004', message: `Tool "${toolConfig.name}" references an operation that was not found`, category: 'GENERATION' }],
      500,
    );
  }

  const result = await performDryRun(config, toolConfig, operation, parsed.data.input, parsed.data.env);
  return ok(result, result.diagnostics);
}
