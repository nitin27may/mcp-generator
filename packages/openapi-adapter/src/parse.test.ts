import { describe, expect, it } from 'vitest';
import { parseOpenApi } from './parse.js';

const SOURCE_ID = 'src-1';

describe('parseOpenApi', () => {
  it('parses a well-formed 3.1 document', async () => {
    const result = await parseOpenApi(
      { openapi: '3.1.0', info: { title: 'X', version: '1.0.0' }, paths: {} },
      { sourceId: SOURCE_ID },
    );
    expect(result.value).toBeDefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects a document declaring an unsupported OpenAPI version', async () => {
    const result = await parseOpenApi(
      { openapi: '3.0.0', info: { title: 'X', version: '1.0.0' }, paths: {} },
      { sourceId: SOURCE_ID },
    );
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('IMP-001');
  });

  it('rejects a document with no detectable OpenAPI version', async () => {
    const result = await parseOpenApi(null, { sourceId: SOURCE_ID });
    expect(result.value).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('IMP-001');
  });

  it('imports a document with an unresolvable external $ref inside a vendor x-* extension, downgraded to a warning', async () => {
    // Mirrors a real-world spec (Bump.sh's Train Travel API) using `x-topics` to embed a
    // $ref to an external markdown file — content outside the operative API surface.
    const result = await parseOpenApi(
      {
        openapi: '3.1.0',
        info: { title: 'X', version: '1.0.0' },
        'x-topics': [{ title: 'Getting started', content: { $ref: './docs/getting-started.md' } }],
        paths: {
          '/x': { get: { responses: { '200': { description: 'ok' } } } },
        },
      },
      { sourceId: SOURCE_ID },
    );

    expect(result.value).toBeDefined();
    expect(result.value?.operations).toHaveLength(1);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });
});
