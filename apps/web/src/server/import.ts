import { randomUUID } from 'node:crypto';
import type { SourceDocumentOrigin } from '@mcpgen/domain';
import {
  BlockedFetchError,
  createSafeFetch,
  DEFAULT_FETCH_POLICY,
  fingerprintOf,
  normalizeOpenApiSource,
  parseOpenApi,
} from '@mcpgen/openapi-adapter';
import { diagnosticToProductError, type ImportRequest, type ImportResult, type ProductError } from '@mcpgen/control-contracts';
import { getEnv } from './env';
import { createStaging } from './project-store';
import type { SourceVersionMeta } from './types';

export type ImportOutcome = { readonly ok: true; readonly result: ImportResult } | { readonly ok: false; readonly errors: readonly ProductError[] };

function detectFormat(rawText: string): 'json' | 'yaml' {
  try {
    JSON.parse(rawText);
    return 'json';
  } catch {
    return 'yaml';
  }
}

/** Reads the version field directly rather than going through `@scalar/*` — `openapi-adapter` is the only package allowed to import that scope (ADR-0003), and this is display metadata, not validation. */
function detectDeclaredVersion(doc: unknown): string {
  if (typeof doc !== 'object' || doc === null) return 'unknown';
  const record = doc as Record<string, unknown>;
  if (typeof record.swagger === 'string') return record.swagger;
  if (typeof record.openapi === 'string') {
    const match = /^(\d+\.\d+)/.exec(record.openapi);
    return match?.[1] ?? record.openapi;
  }
  return 'unknown';
}

function singleError(code: string, message: string): { readonly ok: false; readonly errors: readonly ProductError[] } {
  return { ok: false, errors: [{ code, message, category: 'IMPORT' }] };
}

function importError(code: string, message: string): ImportOutcome {
  return singleError(code, message);
}

type RawTextOutcome = { readonly ok: true; readonly rawText: string; readonly origin: SourceDocumentOrigin } | { readonly ok: false; readonly errors: readonly ProductError[] };

async function resolveRawText(request: ImportRequest): Promise<RawTextOutcome> {
  if (request.kind === 'paste') return { ok: true, rawText: request.text, origin: { type: 'paste' } };
  if (request.kind === 'upload') return { ok: true, rawText: request.text, origin: { type: 'upload', fileName: request.fileName } };

  const { fetch: safeFetch } = createSafeFetch(DEFAULT_FETCH_POLICY);
  let response: Response;
  try {
    response = await safeFetch(request.url);
  } catch (error) {
    const code = error instanceof BlockedFetchError ? error.code : 'IMP-007';
    return singleError(code, `Could not fetch "${request.url}": ${(error as Error).message}`);
  }
  if (!response.ok) return singleError('IMP-007', `Fetching "${request.url}" returned HTTP ${response.status}`);
  return { ok: true, rawText: await response.text(), origin: { type: 'url', url: request.url } };
}

/** `POST /api/import`'s real logic (TIP §53). Never creates a project — a failed parse shouldn't litter the workspace. */
export async function performImport(request: ImportRequest): Promise<ImportOutcome> {
  const resolved = await resolveRawText(request);
  if (!resolved.ok) return resolved;
  const { rawText, origin } = resolved;

  if (Buffer.byteLength(rawText, 'utf8') > getEnv().MCPGEN_MAX_UPLOAD_BYTES) {
    return importError('IMP-002', `Document exceeds maximum size (${getEnv().MCPGEN_MAX_UPLOAD_BYTES} bytes)`);
  }

  const format = detectFormat(rawText);
  const doc = normalizeOpenApiSource(rawText);
  const declaredVersion = detectDeclaredVersion(doc);
  const sourceId = randomUUID();

  const parsed = await parseOpenApi(doc, { sourceId });
  if (!parsed.value) return { ok: false, errors: parsed.diagnostics.map(diagnosticToProductError) };

  const meta: SourceVersionMeta = {
    version: 1,
    format,
    declaredVersion,
    rawFingerprint: fingerprintOf(doc),
    origin,
    importedAt: new Date().toISOString(),
  };

  const importId = await createStaging({ rawText, canonicalApi: parsed.value, meta });

  return {
    ok: true,
    result: {
      importId,
      format,
      sourceVersion: declaredVersion,
      rawFingerprint: meta.rawFingerprint,
      info: parsed.value.info,
      operationCount: parsed.value.operations.length,
      servers: parsed.value.servers,
      securitySchemes: parsed.value.securitySchemes,
      diagnostics: parsed.value.diagnostics,
    },
  };
}
