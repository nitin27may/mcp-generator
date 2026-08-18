import type { CanonicalOperation } from '@mcpgen/domain';

function sanitizeToolName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : '';
}

function pathSlug(path: string): string {
  return path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Every operation gets a name, even without an operationId — never leave a tool unnameable. */
export function defaultToolName(op: CanonicalOperation): string {
  if (op.operationId) {
    const sanitized = sanitizeToolName(op.operationId);
    if (sanitized.length > 0) return sanitized;
  }
  return sanitizeToolName(`${op.method.toLowerCase()}_${pathSlug(op.path)}`) || `tool_${op.id}`;
}

export function snakeCase(name: string): string {
  const converted = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '');
  return converted.length > 0 ? converted : 'value';
}
