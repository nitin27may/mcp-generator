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
export async function parseOpenApi(
  document: unknown,
  options: ParseOpenApiOptions,
): Promise<StageResult<CanonicalApi>> {
  const validation = await validate(document as never);

  if (!validation.valid) {
    return stageFail(validation.errors.map(toValidationDiagnostic));
  }

  if (validation.version !== '3.1') {
    // Not a hard failure of the parser — a scope boundary of this build.
    return stageFail([unsupportedVersionDiagnostic(validation.version)]);
  }

  const dereferenced = dereference(document as never);
  const diagnostics = (dereferenced.errors ?? []).map(toDereferenceDiagnostic);

  if (!dereferenced.schema) {
    return stageFail([...diagnostics, unsupportedVersionDiagnostic(validation.version)]);
  }

  const canonical = canonicalizeOpenApi31(dereferenced.schema as Record<string, unknown>, {
    id: options.sourceId,
    rawFingerprint: fingerprintOf(document),
  });

  return stageOk(canonical, diagnostics);
}
