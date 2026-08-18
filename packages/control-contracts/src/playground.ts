import { z } from 'zod';
import type { Diagnostic } from '@mcpgen/domain';

/** `POST /api/projects/:id/playground/dry-run` body. `toolName` is the agent-facing name (`ToolConfig.name`), matching how a real MCP client would address it — not the internal operation id. */
export const DryRunRequestSchema = z
  .object({
    toolName: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
    env: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type DryRunRequest = z.infer<typeof DryRunRequestSchema>;

/**
 * `HttpRequestParts.query` is a `URLSearchParams` — not directly
 * JSON-serializable (it has no enumerable own properties, so
 * `JSON.stringify` would silently emit `{}` and drop every query param).
 * The wire shape uses an explicit tuple array instead.
 */
export interface DryRunRequestPreview {
  readonly method: string;
  readonly path: string;
  readonly query: readonly (readonly [string, string])[];
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Record<string, unknown>;
}

/** `POST /api/projects/:id/playground/dry-run` response `data`. */
export interface DryRunResult {
  readonly baseUrl?: string;
  readonly request: DryRunRequestPreview;
  /** Names (not binding keys) of environment/secret bindings that had no real value and were placeholder-substituted (`<ENV:NAME>` / `<SECRET:NAME>`) so the preview could still be built. Not an error — dry-run never has real secrets to resolve. */
  readonly unresolvedVariables: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}
