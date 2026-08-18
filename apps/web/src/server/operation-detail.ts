import { buildInputSchema } from '@mcpgen/mcp-runtime';
import { checkSchemaBudget, sanitizeForMcp, validateMcpHeaderAnnotations } from '@mcpgen/schema-normalizer';
import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { CanonicalApi, CanonicalOperation, CanonicalSchemaRef, Diagnostic, SchemaDiagnostic } from '@mcpgen/domain';
import type { OperationDetail, OperationDetailParameter } from '@mcpgen/control-contracts';

function resolveSchema(ref: CanonicalSchemaRef, schemas: CanonicalApi['schemas']): Record<string, unknown> {
  return ref.kind === 'inline' ? ref.schema.schema : (schemas[ref.name]?.schema ?? {});
}

/** New catalog code (TIP §88 MCP-006) — a schema-budget violation is a warning, never a hard error (schema-normalizer never truncates). */
function toDiagnostic(d: SchemaDiagnostic): Diagnostic {
  return {
    severity: 'warning',
    code: 'MCP-006',
    message: d.keyword !== undefined ? `${d.message} (keyword: ${d.keyword})` : d.message,
    ...(d.sourcePointer !== undefined ? { sourcePointer: d.sourcePointer } : {}),
  };
}

/**
 * `parameters`/`requestBody` describe the operation's own raw shape (source
 * names, for the future binding table). `schemaBudget`/`headerAnnotations`
 * run against the *assembled tool input schema for this project's current
 * bindings* (`buildInputSchema` — the exact function `buildToolRegistry`
 * uses at runtime, reused rather than reimplemented so the preview can
 * never drift from what the generated server actually publishes, R5) —
 * agent-facing names, sanitized the same way `generateProject` sanitizes.
 */
export function buildOperationDetail(operation: CanonicalOperation, api: CanonicalApi, config: McpProjectConfig): OperationDetail | undefined {
  const toolConfig = config.tools[operation.id];
  if (!toolConfig) return undefined;

  const parameters: OperationDetailParameter[] = operation.parameters.map((param) => ({
    id: param.id,
    sourceName: param.sourceName,
    location: param.location,
    required: param.required,
    ...(param.description !== undefined ? { description: param.description } : {}),
    schema: resolveSchema(param.schema, api.schemas),
  }));

  let requestBody: OperationDetail['requestBody'];
  if (operation.requestBody) {
    const bodySchema = resolveSchema(operation.requestBody.schema, api.schemas);
    const properties = Object.keys((bodySchema['properties'] as Record<string, unknown>) ?? {});
    const requiredProperties = Array.isArray(bodySchema['required']) ? (bodySchema['required'] as unknown[]).map(String) : [];
    requestBody = {
      required: operation.requestBody.required,
      contentType: operation.requestBody.contentType,
      schema: bodySchema,
      properties,
      requiredProperties,
    };
  }

  const inputSchema = sanitizeForMcp(buildInputSchema(operation, toolConfig));
  const violations = checkSchemaBudget(inputSchema).map(toDiagnostic);

  return {
    id: operation.id,
    method: operation.method,
    path: operation.path,
    parameters,
    ...(requestBody !== undefined ? { requestBody } : {}),
    responses: operation.responses.map((r) => ({
      statusCode: r.statusCode,
      ...(r.description !== undefined ? { description: r.description } : {}),
      ...(r.contentType !== undefined ? { contentType: r.contentType } : {}),
    })),
    schemaBudget: { withinBudget: violations.length === 0, violations },
    headerAnnotations: validateMcpHeaderAnnotations(inputSchema),
  };
}
