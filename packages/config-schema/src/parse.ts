import { stageFail, stageOk, type Diagnostic, type StageResult } from '@mcpgen/domain';
import { McpProjectConfigSchema, type McpProjectConfig } from './project-config.js';

function pointerFrom(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '#' : `#/${path.map(String).join('/')}`;
}

/**
 * Validates a raw value against the portable config schema (TIP §33's
 * "validate schema version" step). §88 catalog: BND-003 for the specific
 * case ADR-0006 exists to catch (a secret binding carrying a literal),
 * otherwise the general CFG-001 code — most Zod structural failures (wrong
 * type, missing field) don't map to one of the narrower binding/generation-
 * specific codes.
 *
 * The issue type is left to contextual inference from `.safeParse()` rather
 * than imported by name — Zod 4 doesn't export a single stable `ZodIssue`
 * type to import (verified: `ZodIssueCode` exists, a general `ZodIssue` does
 * not), and inference works without one.
 */
export function parseProjectConfig(input: unknown): StageResult<McpProjectConfig> {
  const result = McpProjectConfigSchema.safeParse(input);
  if (result.success) return stageOk(result.data);

  const diagnostics = result.error.issues.map((issue): Diagnostic => {
    const pointer = pointerFrom(issue.path);
    // Only SecretBindingSchema lacks a `value` field among this schema's
    // object shapes, so an unrecognized "value" key can only mean one thing.
    const isLeakedSecretValue = issue.code === 'unrecognized_keys' && issue.keys.includes('value');

    if (isLeakedSecretValue) {
      return {
        severity: 'error',
        code: 'BND-003',
        message: `secret binding at ${pointer} must not carry a literal value (ADR-0006)`,
        sourcePointer: pointer,
      };
    }

    return {
      severity: 'error',
      code: 'CFG-001',
      message: `${pointer}: ${issue.message}`,
      sourcePointer: pointer,
    };
  });

  return stageFail(diagnostics);
}
