import { z } from 'zod';

/** `POST /api/projects/:id/generate` body. `expectedRevision` is optional — generation reads whatever config is currently on disk, but supplying it lets the client detect "someone else changed the config after I loaded this page" the same way `PUT /config` does. */
export const GenerateRequestSchema = z.object({ expectedRevision: z.number().int().nonnegative().optional() }).strict();
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export interface GeneratedFile {
  readonly path: string;
  readonly sizeBytes: number;
}

/** `POST /api/projects/:id/generate` response `data`. `downloadUrl` is same-origin and relative — the client renders it as a real `<a download>`, not a fetch+blob dance. */
export interface GenerateResult {
  readonly buildId: string;
  readonly files: readonly GeneratedFile[];
  readonly totalBytes: number;
  readonly downloadUrl: string;
}
