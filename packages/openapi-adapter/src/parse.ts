import { dereference, upgrade, validate } from '@scalar/openapi-parser';
import { stageFail, stageOk, type CanonicalApi, type Diagnostic, type StageResult } from '@mcpgen/domain';
import { canonicalizeOpenApi31 } from './canonicalize-openapi-3-1.js';
import {
  toDereferenceDiagnostic,
  toValidationDiagnostic,
  unsupportedVersionDiagnostic,
  upgradedDiagnostic,
} from './errors.js';
import { fingerprintOf } from './fingerprint.js';
import { DEFAULT_FETCH_POLICY, resolveRemoteReferences, type FetchPolicy } from './remote-fetch/index.js';

export interface ParseOpenApiOptions {
  /** Identity of the SourceDocument this parse belongs to — see TIP §6.1. */
  readonly sourceId: string;
  /** TIP §9. Defaults to `DEFAULT_FETCH_POLICY` (HTTPS-only, private networks blocked). Pass `null` to refuse every remote `$ref` outright rather than fetch it. */
  readonly fetchPolicy?: FetchPolicy | null;
}

/**
 * Source versions accepted by `upgrade()` (TIP §2 row 12, §3.5). OAS 3.2 is
 * deliberately excluded — real-world adoption is ~0% (APIs.guru directory,
 * queried 2026-08-17), and `upgrade()` only targets 3.1 output, so 3.2 would
 * need its own path whenever it's picked up.
 */
const SUPPORTED_SOURCE_VERSIONS: ReadonlySet<string> = new Set(['2.0', '3.0', '3.1']);

/**
 * validate() error codes that don't invalidate the *operative* API surface
 * (paths/components/security) and are safe to downgrade to a warning when
 * dereference() still produced a usable schema. Seen in the wild: Bump.sh's
 * `x-topics` vendor extension embeds a `$ref` to an external markdown file
 * (docs content, not schema) — validate() treats that as fatal, but it isn't.
 * Everything else (missing required fields, malformed schema, ...) stays fatal.
 */
const NON_FATAL_VALIDATION_CODES: ReadonlySet<string> = new Set(['EXTERNAL_REFERENCE_NOT_FOUND']);

/**
 * OpenAPI/Swagger -> `CanonicalApi`. Accepts Swagger 2.0, OAS 3.0, and OAS
 * 3.1 by normalizing everything to 3.1 via `upgrade()` before running the
 * single 3.1 validate/dereference/canonicalize pipeline — there is no
 * separate per-family adapter (TIP §2 row 12). `upgrade()` is a verified
 * no-op for documents that are already 3.1.
 *
 * Scalar's `validate`/`dereference`/`upgrade` utilities are used directly.
 * The fluent `openapi()` pipeline builder that appears in the package's
 * README is deprecated (research notes §12) and is not used here.
 */
export async function parseOpenApi(
  document: unknown,
  options: ParseOpenApiOptions,
): Promise<StageResult<CanonicalApi>> {
  // Captured before upgrade()/bundle() run — both mutate their input in place when no
  // change is needed (verified empirically), which would otherwise silently change the
  // fingerprint of a document that, from the caller's perspective, never changed at all.
  const rawFingerprint = fingerprintOf(document);

  const detection = await validate(document as never);
  const sourceVersion = detection.version;

  if (sourceVersion === undefined || !SUPPORTED_SOURCE_VERSIONS.has(sourceVersion)) {
    return stageFail([unsupportedVersionDiagnostic(sourceVersion)]);
  }

  const upgraded = upgrade(document as never).specification;

  const fetchPolicy = options.fetchPolicy === undefined ? DEFAULT_FETCH_POLICY : options.fetchPolicy;
  const remoteRefDiagnostics: Diagnostic[] = [];
  let normalized: unknown = upgraded;
  if (fetchPolicy !== null) {
    const resolved = await resolveRemoteReferences(upgraded, fetchPolicy);
    normalized = resolved.document;
    remoteRefDiagnostics.push(...resolved.diagnostics);
  }

  const validation = await validate(normalized as never);
  const dereferenced = dereference(normalized as never);
  const dereferenceDiagnostics = (dereferenced.errors ?? []).map(toDereferenceDiagnostic);

  const validationErrors = validation.valid ? [] : validation.errors;
  const fatalValidationErrors = validationErrors.filter((error) => !NON_FATAL_VALIDATION_CODES.has(error.code ?? ''));
  const nonFatalValidationErrors = validationErrors.filter((error) => NON_FATAL_VALIDATION_CODES.has(error.code ?? ''));
  // A blocked/failed remote $ref is fatal, not a warning — presenting a "successful" parse
  // with silently-missing content from a security-blocked fetch would be actively dangerous.
  const fatalRemoteRefErrors = remoteRefDiagnostics.filter((d) => d.severity === 'error');

  if (!dereferenced.schema || fatalValidationErrors.length > 0 || fatalRemoteRefErrors.length > 0) {
    return stageFail([
      ...fatalRemoteRefErrors,
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
  const upgradeNotice = sourceVersion === '3.1' ? [] : [upgradedDiagnostic(sourceVersion)];

  const canonical = canonicalizeOpenApi31(dereferenced.schema as Record<string, unknown>, {
    id: options.sourceId,
    rawFingerprint,
  });

  return stageOk(canonical, [...upgradeNotice, ...remoteRefDiagnostics, ...validationWarnings, ...dereferenceDiagnostics]);
}
