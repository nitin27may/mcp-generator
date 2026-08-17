import { describe, expect, it } from 'vitest';
import { normalizeOpenApiSource } from './normalize-source.js';

describe('normalizeOpenApiSource', () => {
  it('parses a YAML document into a plain object', () => {
    const yaml = ['openapi: 3.1.0', 'info:', '  title: X', '  version: 1.0.0', 'paths: {}'].join('\n');
    expect(normalizeOpenApiSource(yaml)).toEqual({
      openapi: '3.1.0',
      info: { title: 'X', version: '1.0.0' },
      paths: {},
    });
  });

  it('parses a JSON document into a plain object', () => {
    const json = JSON.stringify({ openapi: '3.1.0', info: { title: 'X', version: '1.0.0' }, paths: {} });
    expect(normalizeOpenApiSource(json)).toEqual({
      openapi: '3.1.0',
      info: { title: 'X', version: '1.0.0' },
      paths: {},
    });
  });
});
