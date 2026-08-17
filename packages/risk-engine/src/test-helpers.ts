import type { CanonicalOperation } from '@mcpgen/domain';

export function op(overrides: Partial<CanonicalOperation> = {}): CanonicalOperation {
  return {
    id: 'op',
    sourcePointer: '#/paths/x/get',
    method: 'GET',
    path: '/x',
    tags: [],
    deprecated: false,
    parameters: [],
    responses: [],
    security: [],
    sourceFingerprint: 'fp',
    ...overrides,
  };
}
