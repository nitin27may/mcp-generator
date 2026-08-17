import type { CanonicalSchemaRef } from './schema.js';

/** TIP §6.4 */
export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

export interface ParameterSerialization {
  readonly style?: string;
  readonly explode?: boolean;
}

export interface CanonicalParameter {
  readonly id: string;
  readonly sourceName: string;
  readonly location: ParameterLocation;
  readonly required: boolean;
  readonly description?: string;
  readonly schema: CanonicalSchemaRef;
  readonly serialization?: ParameterSerialization;
}
