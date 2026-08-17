import {
  CANONICAL_MODEL_VERSION,
  normalizeOperationPath,
  type CanonicalApi,
  type CanonicalOperation,
  type CanonicalParameter,
  type CanonicalRequestBody,
  type CanonicalResponse,
  type CanonicalSchema,
  type CanonicalSchemaRef,
  type CanonicalSecurityRequirement,
  type CanonicalSecurityScheme,
  type CanonicalServer,
  type HttpMethod,
  type ParameterLocation,
  type SourceDocumentRef,
} from '@mcpgen/domain';
import { fingerprintOf } from './fingerprint.js';

/**
 * Deliberately loose internal typing. This is the one place OpenAPI-document
 * shapes are allowed to exist (ADR-0003) — Scalar doesn't export a strict
 * OAS 3.1 document interface, and hand-rolling one here would just be a
 * second, unmaintained copy of the spec. Everything downstream of
 * `canonicalizeOpenApi31` sees only `@mcpgen/domain` types.
 */
type Json = Record<string, unknown>;

const HTTP_METHOD_KEYS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export function canonicalizeOpenApi31(doc: Json, source: SourceDocumentRef): CanonicalApi {
  const info = (doc.info ?? {}) as Json;
  const componentSchemas = ((doc.components as Json | undefined)?.schemas ?? {}) as Record<string, Json>;
  const componentSecuritySchemes = ((doc.components as Json | undefined)?.securitySchemes ?? {}) as Record<
    string,
    Json
  >;

  return {
    schemaVersion: CANONICAL_MODEL_VERSION,
    source,
    info: {
      title: String(info.title ?? ''),
      version: String(info.version ?? ''),
      ...(info.description !== undefined ? { description: String(info.description) } : {}),
    },
    servers: ((doc.servers as Json[] | undefined) ?? []).map(canonicalizeServer),
    securitySchemes: Object.entries(componentSecuritySchemes).map(([name, scheme]) =>
      canonicalizeSecurityScheme(name, scheme),
    ),
    operations: collectOperations(doc),
    schemas: Object.fromEntries(
      Object.entries(componentSchemas).map(([name, schema]) => [name, canonicalizeSchema(schema)]),
    ),
    diagnostics: [],
  };
}

function canonicalizeServer(server: Json): CanonicalServer {
  const variables = server.variables as Record<string, Json> | undefined;
  return {
    url: String(server.url ?? ''),
    ...(server.description !== undefined ? { description: String(server.description) } : {}),
    ...(variables
      ? {
          variables: Object.fromEntries(
            Object.entries(variables).map(([name, v]) => [
              name,
              {
                default: String(v.default ?? ''),
                ...(Array.isArray(v.enum) ? { enum: v.enum.map(String) } : {}),
              },
            ]),
          ),
        }
      : {}),
  };
}

function canonicalizeSecurityScheme(name: string, scheme: Json): CanonicalSecurityScheme {
  const type = String(scheme.type ?? '') as CanonicalSecurityScheme['type'];
  const location = typeof scheme.in === 'string' ? (scheme.in as 'header' | 'query' | 'cookie') : undefined;
  return {
    name,
    type,
    ...(scheme.description !== undefined ? { description: String(scheme.description) } : {}),
    ...(location !== undefined ? { in: location } : {}),
    ...(scheme.name !== undefined ? { paramName: String(scheme.name) } : {}),
    ...(scheme.scheme !== undefined ? { scheme: String(scheme.scheme) } : {}),
  };
}

function canonicalizeSchema(schema: unknown): CanonicalSchema {
  return {
    kind: 'json-schema',
    dialect: '2020-12',
    // OAS 3.1 schemas already align with JSON Schema 2020-12 (TIP §10.2) — no
    // dialect translation needed here. `schema-normalizer` (P0-W04-T01) owns
    // MCP-schema sanitization and budget enforcement, not this package.
    schema: (schema ?? {}) as Record<string, unknown>,
    sourceDialect: 'json-schema-2020-12',
    warnings: [],
  };
}

function inlineSchemaRef(schema: unknown): CanonicalSchemaRef {
  return { kind: 'inline', schema: canonicalizeSchema(schema) };
}

function collectOperations(doc: Json): CanonicalOperation[] {
  const paths = (doc.paths ?? {}) as Record<string, Json>;
  const docSecurity = (doc.security as Json[] | undefined) ?? [];
  const operations: CanonicalOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const methodKey of HTTP_METHOD_KEYS) {
      const op = pathItem[methodKey] as Json | undefined;
      if (!op) continue;
      operations.push(canonicalizeOperation(op, path, methodKey.toUpperCase() as HttpMethod, docSecurity));
    }
  }

  return operations;
}

function canonicalizeOperation(
  op: Json,
  path: string,
  method: HttpMethod,
  docSecurity: Json[],
): CanonicalOperation {
  const operationId = op.operationId !== undefined ? String(op.operationId) : undefined;
  const parameters = ((op.parameters as Json[] | undefined) ?? []).map(canonicalizeParameter);
  const requestBody = op.requestBody !== undefined ? canonicalizeRequestBody(op.requestBody as Json) : undefined;
  const responses = canonicalizeResponses((op.responses as Json | undefined) ?? {});
  const security = resolveOperationSecurity(op, docSecurity);

  const canonical: CanonicalOperation = {
    // No explicit vendor stable ID tier at P0 (TIP §7); operationId, else
    // method+normalized-path, is enough to satisfy the fallback tier.
    id: operationId ?? `${method}:${normalizeOperationPath(path)}`,
    sourcePointer: `#/paths/${escapeJsonPointerSegment(path)}/${method.toLowerCase()}`,
    ...(operationId !== undefined ? { operationId } : {}),
    method,
    path,
    tags: Array.isArray(op.tags) ? op.tags.map(String) : [],
    ...(op.summary !== undefined ? { summary: String(op.summary) } : {}),
    ...(op.description !== undefined ? { description: String(op.description) } : {}),
    deprecated: op.deprecated === true,
    parameters,
    ...(requestBody ? { requestBody } : {}),
    responses,
    security,
    // Hashes the operation as it appears in the (already-dereferenced) document,
    // so a semantically identical operation always fingerprints identically —
    // TIP §7 operation identity depends on this being stable, not just unique.
    sourceFingerprint: fingerprintOf(op),
  };

  return canonical;
}

function canonicalizeParameter(param: Json): CanonicalParameter {
  const location = String(param.in ?? 'query') as ParameterLocation;
  const style = param.style !== undefined ? String(param.style) : undefined;
  const explode = typeof param.explode === 'boolean' ? param.explode : undefined;

  return {
    id: `${location}:${String(param.name ?? '')}`,
    sourceName: String(param.name ?? ''),
    location,
    required: param.required === true,
    ...(param.description !== undefined ? { description: String(param.description) } : {}),
    schema: inlineSchemaRef(param.schema),
    ...(style !== undefined || explode !== undefined
      ? { serialization: { ...(style !== undefined ? { style } : {}), ...(explode !== undefined ? { explode } : {}) } }
      : {}),
  };
}

function firstContentEntry(content: Json | undefined): [string, Json] | undefined {
  if (!content) return undefined;
  const keys = Object.keys(content);
  if (keys.length === 0) return undefined;
  const preferred = keys.includes('application/json') ? 'application/json' : keys[0]!;
  return [preferred, content[preferred] as Json];
}

function canonicalizeRequestBody(body: Json): CanonicalRequestBody {
  const entry = firstContentEntry(body.content as Json | undefined);
  return {
    required: body.required === true,
    ...(body.description !== undefined ? { description: String(body.description) } : {}),
    contentType: entry?.[0] ?? 'application/json',
    schema: inlineSchemaRef(entry?.[1]?.schema),
  };
}

function canonicalizeResponses(responses: Json): CanonicalResponse[] {
  return Object.entries(responses).map(([statusCode, response]) => {
    const r = response as Json;
    const entry = firstContentEntry(r.content as Json | undefined);
    return {
      statusCode,
      ...(r.description !== undefined ? { description: String(r.description) } : {}),
      ...(entry ? { contentType: entry[0], schema: inlineSchemaRef(entry[1]?.schema) } : {}),
    };
  });
}

/**
 * Operation-level `security` overrides document-level; an *explicit* empty
 * array means "no security", which is different from the field being absent.
 * Each requirement object's keys are flattened to individual entries — this
 * loses strict AND-grouping between co-occurring schemes within one
 * requirement object, accepted as a P0 simplification since single-scheme
 * requirements dominate real-world specs.
 */
function resolveOperationSecurity(op: Json, docSecurity: Json[]): CanonicalSecurityRequirement[] {
  const raw = 'security' in op ? ((op.security as Json[] | undefined) ?? []) : docSecurity;
  const out: CanonicalSecurityRequirement[] = [];
  for (const requirement of raw) {
    for (const [schemeName, scopes] of Object.entries(requirement)) {
      out.push({ schemeName, scopes: Array.isArray(scopes) ? scopes.map(String) : [] });
    }
  }
  return out;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}
