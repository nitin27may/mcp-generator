import { z } from 'zod';

/** `POST /api/projects/:id/analyze` body. `force` bypasses the sourceFingerprint-match skip (recompute is cheap and pure, but free when the source hasn't changed). */
export const AnalyzeRequestSchema = z.object({ force: z.boolean().optional() }).strict();
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
