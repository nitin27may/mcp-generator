import { describe, expect, it } from 'vitest';
import { api, op } from '../test-helpers.js';
import { duplicateOperationId, genericName, missingOperationId, nameTooLong, normalizedNameCollision } from './naming.js';

describe('ARA-NAME-001 missingOperationId', () => {
  it('flags an operation with no operationId', () => {
    expect(missingOperationId.evaluate(api([op({ operationId: undefined })]))).toHaveLength(1);
  });
  it('does not flag an operation with an operationId', () => {
    expect(missingOperationId.evaluate(api([op({ operationId: 'getX' })]))).toHaveLength(0);
  });
});

describe('ARA-NAME-002 duplicateOperationId', () => {
  it('flags two operations sharing an operationId', () => {
    const findings = duplicateOperationId.evaluate(api([op({ operationId: 'x', path: '/a' }), op({ operationId: 'x', path: '/b' })]));
    expect(findings).toHaveLength(2);
  });
  it('does not flag unique operationIds', () => {
    expect(duplicateOperationId.evaluate(api([op({ operationId: 'a' }), op({ operationId: 'b' })]))).toHaveLength(0);
  });
});

describe('ARA-NAME-003 normalizedNameCollision', () => {
  it('flags operations that normalize to the same tool name', () => {
    const findings = normalizedNameCollision.evaluate(api([op({ operationId: 'get-customer', path: '/a' }), op({ operationId: 'get_customer', path: '/b' })]));
    expect(findings).toHaveLength(1);
  });
  it('does not flag distinctly-named operations', () => {
    expect(normalizedNameCollision.evaluate(api([op({ operationId: 'getCustomer' }), op({ operationId: 'listCustomers' })]))).toHaveLength(0);
  });
});

describe('ARA-NAME-004 genericName', () => {
  it('flags a bare generic verb as the operationId', () => {
    expect(genericName.evaluate(api([op({ operationId: 'get' })]))).toHaveLength(1);
  });
  it('does not flag a descriptive operationId', () => {
    expect(genericName.evaluate(api([op({ operationId: 'getCustomer' })]))).toHaveLength(0);
  });
});

describe('ARA-NAME-005 nameTooLong', () => {
  it('flags a name exceeding the safe length', () => {
    expect(nameTooLong.evaluate(api([op({ operationId: 'x'.repeat(200) })]))).toHaveLength(1);
  });
  it('does not flag a normal-length name', () => {
    expect(nameTooLong.evaluate(api([op({ operationId: 'getCustomer' })]))).toHaveLength(0);
  });
});
