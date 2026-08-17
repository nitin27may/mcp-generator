import { z } from 'zod';
import { GenerationConfigSchema } from './generation-config.js';
import { ToolConfigSchema } from './tool-config.js';
import { UpstreamAuthenticationSchema } from './upstream-auth.js';
import { EnvironmentBindingSchema, StaticBindingSchema } from './value-binding.js';

export const CONFIG_SCHEMA_VERSION = '1.0';

const ProjectMetadataSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

const ApiRuntimeConfigSchema = z
  .object({
    // A base URL is deployment-fixed, never per-call — tool-input/secret would
    // be the wrong binding kind here.
    baseUrl: z.discriminatedUnion('source', [EnvironmentBindingSchema, StaticBindingSchema]),
  })
  .strict();

/**
 * TIP §11.1, trimmed to what P0's hand-authored config needs: project
 * metadata, API base URL, one upstream auth scheme, and the tool surface.
 * `groups`, `mcpAccess`, `defaults`, and `runtime` are P1+ config surface —
 * added when a task needs them (config inheritance is `P1-W05-T01`), not
 * speculatively.
 */
export const McpProjectConfigSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
    project: ProjectMetadataSchema,
    api: ApiRuntimeConfigSchema,
    upstreamAuthentication: UpstreamAuthenticationSchema.optional(),
    tools: z.record(z.string(), ToolConfigSchema),
    generation: GenerationConfigSchema,
  })
  .strict()
  .superRefine((config, ctx) => {
    // BR-002: every ENABLED tool name must be unique. A disabled tool isn't
    // exposed, so it can't collide with anything.
    const seen = new Map<string, string>();
    for (const [key, tool] of Object.entries(config.tools)) {
      if (!tool.enabled) continue;
      const existingKey = seen.get(tool.name);
      if (existingKey !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `tool name "${tool.name}" is used by both "${existingKey}" and "${key}" — every enabled tool name must be unique (BR-002)`,
          path: ['tools', key, 'name'],
        });
      } else {
        seen.set(tool.name, key);
      }
    }
  });

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
export type ApiRuntimeConfig = z.infer<typeof ApiRuntimeConfigSchema>;
export type McpProjectConfig = z.infer<typeof McpProjectConfigSchema>;
