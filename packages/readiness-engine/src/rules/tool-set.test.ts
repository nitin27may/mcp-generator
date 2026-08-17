import { describe, expect, it } from 'vitest';
import { api, op } from '../test-helpers.js';
import { deprecatedOperation, internalLookingOperation, overlappingListAndSearch, semanticallySimilarOperations, tooManyToolsPerTag } from './tool-set.js';

describe('ARA-TOOL-001 tooManyToolsPerTag', () => {
  it('flags a tag used by too many operations', () => {
    const ops = Array.from({ length: 20 }, (_, i) => op({ operationId: `op${i}`, path: `/x${i}`, tags: ['customers'] }));
    expect(tooManyToolsPerTag.evaluate(api(ops))).toHaveLength(1);
  });
  it('does not flag a tag with few operations', () => {
    expect(tooManyToolsPerTag.evaluate(api([op({ tags: ['customers'] })]))).toHaveLength(0);
  });
});

describe('ARA-TOOL-002 semanticallySimilarOperations', () => {
  it('flags same-method operations with identical descriptions', () => {
    const findings = semanticallySimilarOperations.evaluate(
      api([op({ operationId: 'a', path: '/a', description: 'Fetches a resource' }), op({ operationId: 'b', path: '/b', description: 'Fetches a resource' })]),
    );
    expect(findings).toHaveLength(1);
  });
  it('does not flag operations with distinct descriptions', () => {
    const findings = semanticallySimilarOperations.evaluate(
      api([op({ operationId: 'a', description: 'Fetches a customer' }), op({ operationId: 'b', description: 'Fetches an order' })]),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('ARA-TOOL-003 deprecatedOperation', () => {
  it('flags a deprecated operation', () => {
    expect(deprecatedOperation.evaluate(api([op({ deprecated: true })]))).toHaveLength(1);
  });
  it('does not flag a non-deprecated operation', () => {
    expect(deprecatedOperation.evaluate(api([op({ deprecated: false })]))).toHaveLength(0);
  });
});

describe('ARA-TOOL-004 internalLookingOperation', () => {
  it('flags a path that looks internal', () => {
    expect(internalLookingOperation.evaluate(api([op({ path: '/internal/debug/reset' })]))).toHaveLength(1);
  });
  it('does not flag an ordinary public-looking path', () => {
    expect(internalLookingOperation.evaluate(api([op({ path: '/customers' })]))).toHaveLength(0);
  });
});

describe('ARA-TOOL-005 overlappingListAndSearch', () => {
  it('flags a list endpoint and a /search endpoint on the same resource', () => {
    const findings = overlappingListAndSearch.evaluate(api([op({ operationId: 'list', path: '/customers' }), op({ operationId: 'search', path: '/customers/search' })]));
    expect(findings).toHaveLength(1);
  });
  it('does not flag when there is no search endpoint', () => {
    expect(overlappingListAndSearch.evaluate(api([op({ operationId: 'list', path: '/customers' })]))).toHaveLength(0);
  });
});
