import { describe, expect, it } from 'vitest';
import { api, op, schemaRef } from '../test-helpers.js';
import { successResponseMissingSchema } from './response.js';

describe('ARA-RESP-001 successResponseMissingSchema', () => {
  it('flags a 2xx response with no schema', () => {
    const findings = successResponseMissingSchema.evaluate(api([op({ responses: [{ statusCode: '200', description: 'OK' }] })]));
    expect(findings).toHaveLength(1);
  });

  it('does not flag a 2xx response that has a schema', () => {
    const findings = successResponseMissingSchema.evaluate(
      api([op({ responses: [{ statusCode: '200', description: 'OK', schema: schemaRef({ type: 'object' }) }] })]),
    );
    expect(findings).toHaveLength(0);
  });

  it('does not flag when the only schema-less response is an error status', () => {
    const findings = successResponseMissingSchema.evaluate(api([op({ responses: [{ statusCode: '404', description: 'Not found' }] })]));
    expect(findings).toHaveLength(0);
  });

  it('does not flag an operation with no responses declared at all', () => {
    expect(successResponseMissingSchema.evaluate(api([op({ responses: [] })]))).toHaveLength(0);
  });
});
