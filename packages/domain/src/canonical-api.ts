import type { Diagnostic } from './diagnostic.js';
import type { CanonicalOperation } from './operation.js';
import type { CanonicalSchema } from './schema.js';
import type { SourceDocumentRef } from './source-document.js';

/** Schema version of the canonical model itself — bumped independently of the config schema (TIP §29.1). */
export const CANONICAL_MODEL_VERSION = '1.0';

export interface ApiInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
}

export interface CanonicalServerVariable {
  readonly default: string;
  readonly enum?: string[];
}

export interface CanonicalServer {
  readonly url: string;
  readonly description?: string;
  readonly variables?: Record<string, CanonicalServerVariable>;
}

export type CanonicalSecuritySchemeType = 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';

export interface CanonicalSecurityScheme {
  readonly name: string;
  readonly type: CanonicalSecuritySchemeType;
  readonly description?: string;
  /** For `apiKey` schemes. */
  readonly in?: 'header' | 'query' | 'cookie';
  readonly paramName?: string;
  /** For `http` schemes: "bearer" | "basic". */
  readonly scheme?: string;
}

/** TIP §6.2 — the permanent business domain model. Never an OpenAPI object graph (ADR-0003). */
export interface CanonicalApi {
  readonly schemaVersion: string;
  readonly source: SourceDocumentRef;
  readonly info: ApiInfo;
  readonly servers: CanonicalServer[];
  readonly securitySchemes: CanonicalSecurityScheme[];
  readonly operations: CanonicalOperation[];
  readonly schemas: Record<string, CanonicalSchema>;
  readonly diagnostics: Diagnostic[];
}
