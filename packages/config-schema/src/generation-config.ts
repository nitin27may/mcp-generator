import { z } from 'zod';
import { isValidBinName, isValidNpmPackageName } from './npm-name.js';

/**
 * TIP §11.3 / BRD FR-PKG-006, FR-PKG-007, BR-011: the generated package's
 * identity is the platform user's choice — never a house default, never
 * derived from platform branding. `license` is omitted entirely (no default)
 * unless the user supplies one (OQ-07): inserting a license into someone
 * else's package is a legal assertion this platform is not entitled to make.
 */
export const GenerationConfigSchema = z
  .object({
    packageName: z.string().refine(isValidNpmPackageName, {
      message: 'must be a valid npm package name (lowercase, optional @scope/, no leading . or _, <=214 chars)',
    }),
    binName: z.string().refine(isValidBinName, {
      message: 'must be a POSIX-portable command name (letters, digits, ".", "-", "_", <=64 chars)',
    }),
    version: z.string().min(1),
    license: z.string().min(1).optional(),
    transports: z.array(z.enum(['stdio', 'http'])).min(1),
    emitDockerfile: z.boolean(),
    mode: z.enum(['thin', 'self-contained']),
  })
  .strict();

export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;
