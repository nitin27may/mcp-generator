import { z } from 'zod';
import type { ApiInfo, CanonicalSecurityScheme, CanonicalServer, Diagnostic } from '@mcpgen/domain';

/** `POST /api/import` body. Text-in-JSON rather than multipart — one less plugin, and the upload control reads the file client-side anyway. */
export const ImportRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paste'), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('upload'), text: z.string().min(1), fileName: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('url'), url: z.string().url() }).strict(),
]);
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

export const CreateProjectRequestSchema = z.object({ importId: z.string().uuid(), name: z.string().min(1).optional() }).strict();
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

/** `POST /api/import` response `data`. Doesn't create a project — a failed parse shouldn't litter the workspace; `importId` is a staging key only, not a project id. */
export interface ImportResult {
  readonly importId: string;
  readonly format: 'json' | 'yaml';
  readonly sourceVersion: string;
  readonly rawFingerprint: string;
  readonly info: ApiInfo;
  readonly operationCount: number;
  readonly servers: readonly CanonicalServer[];
  readonly securitySchemes: readonly CanonicalSecurityScheme[];
  readonly diagnostics: readonly Diagnostic[];
}
