import { z } from 'zod';

/**
 * `POST /api/projects/:id/playground/execute` body. `secrets` is
 * request-scoped only — never persisted to `config.json`, never logged,
 * held in memory for the duration of this one call. `acknowledgeRisk` must
 * be `true` for a `DESTRUCTIVE`/`PRIVILEGED` tool (428 `PLG-001` otherwise).
 */
export const ExecuteRequestSchema = z
  .object({
    toolName: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
    env: z.record(z.string(), z.string()).default({}),
    secrets: z.record(z.string(), z.string()).default({}),
    acknowledgeRisk: z.boolean().default(false),
  })
  .strict();
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

/** TIP §36. `resolvedRequest`/`response`/`input` are already redacted server-side before this ever leaves the process. */
export interface RedactedHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ExecutionTrace {
  readonly traceId: string;
  readonly toolName: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly input: unknown;
  readonly resolvedRequest?: RedactedHttpRequest;
  readonly upstreamStatus?: number;
  readonly response: unknown;
  readonly resultType: 'success' | 'validation-error' | 'upstream-error';
}
