import { dereference, validate } from '@scalar/openapi-parser';
import { stageFail, stageOk, type CanonicalApi, type StageResult } from '@mcpgen/domain';
import { canonicalizeOpenApi31 } from './canonicalize-openapi-3-1.js';
import { toDereferenceDiagnostic, toValidationDiagnostic, unsupportedVersionDiagnostic } from './errors.js';
import { fingerprintOf } from './fingerprint.js';

export interface ParseOpenApiOptions {
  /** Identity of the SourceDocument this parse belongs to — see TIP §6.1. */
  readonly sourceId: string;
}

/**
 * OpenAPI/Swagger -> `CanonicalApi`. P0 supports OAS 3.1 only; the remaining
 * three families (Swagger 2.0, OAS 3.0, OAS 3.2) are P1 (TIP §83.3,
 * `P1-W03-T01…T03`) — see the version dispatch below for the seam.
 *
 * Scalar's `validate`/`dereference` utilities are used directly. The fluent
 * `openapi()` pipeline builder that appears in the package's README is
 * deprecated (research notes §12) and is not used here.
 */
/**
 * validate() error codes that don't invalidate the *operative* API surface
 * (paths/components/security) and are safe to downgrade to a warning when
 * dereference() still produced a usable schema. Seen in the wild: Bump.sh's
 * `x-topics` vendor extension embeds a `$ref` to an external markdown file
 * (docs content, not schema) — validate() treats that as fatal, but it isn't.
 * Everything else (missing required fields, malformed schema, ...) stays fatal.
 */
const NON_FATAL_VALIDATION_CODES: ReadonlySet<string> = new Set(['EXTERNAL_REFERENCE_NOT_FOUND']);

export async function parseOpenApi(
  document: unknown,
  options: ParseOpenApiOptions,
): Promise<StageResult<CanonicalApi>> {
  const validation = await validate(document as never);

  if (validation.version !== '3.1') {
    // Not a hard failure of the parser — a scope boundary of this build.
    return stageFail([unsupportedVersionDiagnostic(validation.version)]);
  }

  const dereferenced = dereference(document as never);
  const dereferenceDiagnostics = (dereferenced.errors ?? []).map(toDereferenceDiagnostic);

  const validationErrors = validation.valid ? [] : validation.errors;
  const fatalValidationErrors = validationErrors.filter((error) => !NON_FATAL_VALIDATION_CODES.has(error.code ?? ''));
  const nonFatalValidationErrors = validationErrors.filter((error) => NON_FATAL_VALIDATION_CODES.has(error.code ?? ''));

  if (!dereferenced.schema || fatalValidationErrors.length > 0) {
    return stageFail([
      ...fatalValidationErrors.map(toValidationDiagnostic),
      ...nonFatalValidationErrors.map(toValidationDiagnostic),
      ...dereferenceDiagnostics,
      ...(!dereferenced.schema ? [unsupportedVersionDiagnostic(validation.version)] : []),
    ]);
  }

  const validationWarnings = nonFatalValidationErrors.map((error) => ({
    ...toValidationDiagnostic(error),
    severity: 'warning' as const,
  }));

  const canonical = canonicalizeOpenApi31(dereferenced.schema as Record<string, unknown>, {
    id: options.sourceId,
    rawFingerprint: fingerprintOf(document),
  });

  return stageOk(canonical, [...validationWarnings, ...dereferenceDiagnostics]);
}
