import { describe, expect, it } from 'vitest';
import { api, op } from '../test-helpers.js';
import { bulkMutationCandidate, deleteOperation, privilegedOperation, writeOperationNoMeaningfulDescription } from './safety.js';

describe('ARA-SAFE-001 deleteOperation', () => {
  it('flags a DELETE operation', () => {
    expect(deleteOperation.evaluate(api([op({ method: 'DELETE' })]))).toHaveLength(1);
  });
  it('does not flag a GET operation', () => {
    expect(deleteOperation.evaluate(api([op({ method: 'GET' })]))).toHaveLength(0);
  });
});

describe('ARA-SAFE-002 bulkMutationCandidate', () => {
  it('flags a POST to a bulk-shaped path', () => {
    expect(bulkMutationCandidate.evaluate(api([op({ method: 'POST', path: '/customers/bulk-delete' })]))).toHaveLength(1);
  });
  it('does not flag an ordinary POST', () => {
    expect(bulkMutationCandidate.evaluate(api([op({ method: 'POST', path: '/customers' })]))).toHaveLength(0);
  });
});

describe('ARA-SAFE-003 privilegedOperation', () => {
  it('flags an admin-shaped path', () => {
    expect(privilegedOperation.evaluate(api([op({ path: '/admin/users' })]))).toHaveLength(1);
  });
  it('does not flag an ordinary path', () => {
    expect(privilegedOperation.evaluate(api([op({ path: '/customers' })]))).toHaveLength(0);
  });
});

describe('ARA-SAFE-004 writeOperationNoMeaningfulDescription', () => {
  it('flags a write operation with no description at all', () => {
    expect(writeOperationNoMeaningfulDescription.evaluate(api([op({ method: 'POST', description: undefined })]))).toHaveLength(1);
  });
  it('does not flag a write operation that has a description', () => {
    expect(writeOperationNoMeaningfulDescription.evaluate(api([op({ method: 'POST', description: 'Creates a customer.' })]))).toHaveLength(0);
  });
});
