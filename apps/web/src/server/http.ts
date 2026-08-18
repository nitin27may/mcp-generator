import type { ApiFail, ApiOk, ProductError } from '@mcpgen/control-contracts';
import type { Diagnostic } from '@mcpgen/domain';

/** `2xx -> ApiOk<T>` (TIP §53/§54). */
export function ok<T>(data: T, diagnostics: readonly Diagnostic[] = [], status = 200): Response {
  return Response.json({ data, diagnostics } satisfies ApiOk<T>, { status });
}

/** `4xx/5xx -> ApiFail`. */
export function fail(errors: readonly ProductError[], status: number): Response {
  return Response.json({ errors } satisfies ApiFail, { status });
}

/** A request body that isn't even valid JSON — same shape as a Zod validation failure, distinct code. */
export function invalidJsonBody(): Response {
  return fail([{ code: 'CFG-001', message: 'Request body was not valid JSON', category: 'VALIDATION' }], 400);
}

/** `409` on an `expectedRevision` mismatch (TIP §51 D2) — `serverRevision` rides alongside `errors` so the client can offer "reload" or "overwrite" without a second round trip. */
export function conflict(serverRevision: number): Response {
  return Response.json(
    {
      errors: [
        {
          code: 'CFG-002',
          message: `Configuration was changed by another session (server is at revision ${serverRevision})`,
          category: 'VALIDATION',
        },
      ],
      serverRevision,
    } satisfies ApiFail & { serverRevision: number },
    { status: 409 },
  );
}
