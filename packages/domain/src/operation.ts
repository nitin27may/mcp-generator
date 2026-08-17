import type { CanonicalParameter } from './parameter.js';
import type { CanonicalSchemaRef } from './schema.js';

/** TIP §6.3 */
export type HttpMethod = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'PATCH' | 'TRACE';

export interface CanonicalRequestBody {
  readonly required: boolean;
  readonly description?: string;
  readonly contentType: string;
  readonly schema: CanonicalSchemaRef;
}

export interface CanonicalResponse {
  /** HTTP status code as a string ("200"), or "default". */
  readonly statusCode: string;
  readonly description?: string;
  readonly contentType?: string;
  readonly schema?: CanonicalSchemaRef;
}

export interface CanonicalSecurityRequirement {
  readonly schemeName: string;
  readonly scopes: string[];
}

export interface CanonicalOperation {
  /** Internal stable identity — see operation-identity.ts. Not `operationId`, which teams rename. */
  readonly id: string;
  readonly sourcePointer: string;
  readonly operationId?: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly tags: string[];
  readonly summary?: string;
  readonly description?: string;
  readonly deprecated: boolean;
  readonly parameters: CanonicalParameter[];
  readonly requestBody?: CanonicalRequestBody;
  readonly responses: CanonicalResponse[];
  readonly security: CanonicalSecurityRequirement[];
  readonly sourceFingerprint: string;
}
