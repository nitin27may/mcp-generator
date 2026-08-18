import type { SourceDocumentOrigin } from '@mcpgen/domain';

export const PROJECT_RECORD_SCHEMA_VERSION = '1.0';

/** `<workspace>/<projectId>/project.json`. */
export interface ProjectRecord {
  readonly schemaVersion: typeof PROJECT_RECORD_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly configRevision: number;
  readonly currentSourceVersion: number;
}

/** `<workspace>/<projectId>/source/v<n>/meta.json`. */
export interface SourceVersionMeta {
  readonly version: number;
  readonly format: 'json' | 'yaml';
  readonly declaredVersion: string;
  readonly rawFingerprint: string;
  readonly origin: SourceDocumentOrigin;
  readonly importedAt: string;
}
