import { describe, expect, it } from 'vitest';
import { api, op, param } from '../test-helpers.js';
import {
  genericOrShortDescription,
  missingDescription,
  missingParameterDescription,
  missingSummary,
  parameterDescriptionRepeatsName,
  undocumentedEnum,
  writeOperationMissingSideEffect,
} from './documentation.js';

describe('ARA-DOC-001 missingSummary', () => {
  it('flags an operation with no summary', () => {
    expect(missingSummary.evaluate(api([op({ summary: undefined })]))).toHaveLength(1);
  });
  it('does not flag an operation with a summary', () => {
    expect(missingSummary.evaluate(api([op({ summary: 'Fetch a customer' })]))).toHaveLength(0);
  });
});

describe('ARA-DOC-002 missingDescription', () => {
  it('flags an operation with no description', () => {
    expect(missingDescription.evaluate(api([op({ description: undefined })]))).toHaveLength(1);
  });
  it('does not flag an operation with a description', () => {
    expect(missingDescription.evaluate(api([op({ description: 'Fetches a customer by id.' })]))).toHaveLength(0);
  });
});

describe('ARA-DOC-003 missingParameterDescription', () => {
  it('flags a parameter with no description', () => {
    const findings = missingParameterDescription.evaluate(api([op({ parameters: [param({ sourceName: 'id', description: undefined })] })]));
    expect(findings).toHaveLength(1);
  });
  it('does not flag a documented parameter', () => {
    const findings = missingParameterDescription.evaluate(api([op({ parameters: [param({ sourceName: 'id', description: 'Customer identifier' })] })]));
    expect(findings).toHaveLength(0);
  });
});

describe('ARA-DOC-004 parameterDescriptionRepeatsName', () => {
  it('flags a description that is just the parameter name restated', () => {
    const findings = parameterDescriptionRepeatsName.evaluate(api([op({ parameters: [param({ sourceName: 'customerId', description: 'Customer Id' })] })]));
    expect(findings).toHaveLength(1);
  });
  it('does not flag a meaningfully distinct description', () => {
    const findings = parameterDescriptionRepeatsName.evaluate(api([op({ parameters: [param({ sourceName: 'customerId', description: 'The unique identifier of the customer to fetch' })] })]));
    expect(findings).toHaveLength(0);
  });
});

describe('ARA-DOC-005 genericOrShortDescription', () => {
  it('flags a generic description', () => {
    expect(genericOrShortDescription.evaluate(api([op({ description: 'Gets data' })]))).toHaveLength(1);
  });
  it('flags a too-short description', () => {
    expect(genericOrShortDescription.evaluate(api([op({ description: 'x' })]))).toHaveLength(1);
  });
  it('does not flag a specific, adequately long description', () => {
    expect(genericOrShortDescription.evaluate(api([op({ description: 'Fetches a single customer record by its unique identifier.' })]))).toHaveLength(0);
  });
});

describe('ARA-DOC-006 writeOperationMissingSideEffect', () => {
  it('flags a POST whose description states no side effect', () => {
    expect(writeOperationMissingSideEffect.evaluate(api([op({ method: 'POST', description: 'Handles the customer request.' })]))).toHaveLength(1);
  });
  it('does not flag a POST whose description states the side effect', () => {
    expect(writeOperationMissingSideEffect.evaluate(api([op({ method: 'POST', description: 'Creates a new customer record.' })]))).toHaveLength(0);
  });
  it('does not flag a GET regardless of description', () => {
    expect(writeOperationMissingSideEffect.evaluate(api([op({ method: 'GET', description: 'Handles the customer request.' })]))).toHaveLength(0);
  });
});

describe('ARA-DOC-007 undocumentedEnum', () => {
  it('flags an undocumented enum parameter', () => {
    const findings = undocumentedEnum.evaluate(
      api([op({ parameters: [param({ sourceName: 'status', description: undefined, schema: { kind: 'inline', schema: { kind: 'json-schema', dialect: '2020-12', schema: { type: 'string', enum: ['a', 'b'] }, sourceDialect: 'json-schema-2020-12', warnings: [] } } })] })]),
    );
    expect(findings).toHaveLength(1);
  });
  it('does not flag a documented enum parameter', () => {
    const findings = undocumentedEnum.evaluate(
      api([op({ parameters: [param({ sourceName: 'status', description: 'The status filter', schema: { kind: 'inline', schema: { kind: 'json-schema', dialect: '2020-12', schema: { type: 'string', enum: ['a', 'b'] }, sourceDialect: 'json-schema-2020-12', warnings: [] } } })] })]),
    );
    expect(findings).toHaveLength(0);
  });
});
