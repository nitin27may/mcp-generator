import type { CanonicalOperation, CanonicalSchemaRef } from '@mcpgen/domain';
import type { ReadinessCategory, ReadinessFinding, ReadinessSeverity } from './types.js';

export function finding(
  ruleId: string,
  category: ReadinessCategory,
  severity: ReadinessSeverity,
  title: string,
  explanation: string,
  options: { operationId?: string; sourcePointer?: string; remediation?: string; autoFixAvailable?: boolean } = {},
): ReadinessFinding {
  return {
    ruleId,
    category,
    severity,
    title,
    explanation,
    autoFixAvailable: options.autoFixAvailable ?? false,
    ...(options.operationId !== undefined ? { operationId: options.operationId } : {}),
    ...(options.sourcePointer !== undefined ? { sourcePointer: options.sourcePointer } : {}),
    ...(options.remediation !== undefined ? { remediation: options.remediation } : {}),
  };
}

/** Every operation's displayable identity: prefer operationId, fall back to method+path. */
export function operationLabel(op: CanonicalOperation): string {
  return op.operationId ?? `${op.method} ${op.path}`;
}

export function schemaOf(ref: CanonicalSchemaRef | undefined): Record<string, unknown> | undefined {
  return ref?.kind === 'inline' ? ref.schema.schema : undefined;
}

/** All JSON-Schema-shaped values an operation carries: parameters, request body, responses. */
export function operationSchemas(op: CanonicalOperation): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [];
  for (const param of op.parameters) {
    const schema = schemaOf(param.schema);
    if (schema) schemas.push(schema);
  }
  const bodySchema = schemaOf(op.requestBody?.schema);
  if (bodySchema) schemas.push(bodySchema);
  for (const response of op.responses) {
    const responseSchema = schemaOf(response.schema);
    if (responseSchema) schemas.push(responseSchema);
  }
  return schemas;
}
