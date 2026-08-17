/**
 * TIP §6.5 / §10 — canonical schema representation. Every source dialect is normalized
 * toward JSON Schema 2020-12, but the source dialect and any conversion warnings are
 * retained: OAS 3.0 schemas are not equivalent to full JSON Schema 2020-12, and pretending
 * otherwise is exactly what ADR-0003/TIP §10.2 warns against.
 */
export type SchemaSourceDialect = 'swagger-2' | 'openapi-3.0' | 'json-schema-2020-12';

export interface SchemaDiagnostic {
  readonly message: string;
  readonly keyword?: string;
  readonly sourcePointer?: string;
}

export interface CanonicalSchema {
  readonly kind: 'json-schema';
  readonly dialect: '2020-12';
  readonly schema: Record<string, unknown>;
  readonly sourceDialect: SchemaSourceDialect;
  readonly warnings: SchemaDiagnostic[];
}

/**
 * A reference to a schema is either inline or a named lookup into
 * `CanonicalApi.schemas`. Keeping this a closed union (rather than a bare
 * `$ref` string) means every consumer resolves it the same way.
 */
export type CanonicalSchemaRef =
  | { readonly kind: 'inline'; readonly schema: CanonicalSchema }
  | { readonly kind: 'ref'; readonly name: string };
