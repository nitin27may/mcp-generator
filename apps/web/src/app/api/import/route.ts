import { ImportRequestSchema } from '@mcpgen/control-contracts';
import { fail, invalidJsonBody, ok } from '@/server/http';
import { performImport } from '@/server/import';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonBody();
  }

  const parsed = ImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((issue) => ({
        code: 'IMP-003',
        message: issue.message,
        category: 'IMPORT' as const,
        sourcePointer: `#/${issue.path.join('/')}`,
      })),
      400,
    );
  }

  const outcome = await performImport(parsed.data);
  if (!outcome.ok) return fail(outcome.errors, 422);
  return ok(outcome.result, outcome.result.diagnostics);
}
