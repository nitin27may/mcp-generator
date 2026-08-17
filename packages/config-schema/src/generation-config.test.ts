import { describe, expect, it } from 'vitest';
import { GenerationConfigSchema } from './generation-config.js';

const VALID = {
  packageName: '@acme/customer-mcp',
  binName: 'customer-mcp',
  version: '0.1.0',
  transports: ['stdio'],
  emitDockerfile: true,
  mode: 'thin',
} as const;

describe('GenerationConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(GenerationConfigSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts a config with no license — omitted, never defaulted (OQ-07)', () => {
    const result = GenerationConfigSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.license).toBeUndefined();
  });

  it('accepts an explicit license when the user supplies one', () => {
    expect(GenerationConfigSchema.safeParse({ ...VALID, license: 'MIT' }).success).toBe(true);
  });

  it('rejects an invalid package name rather than rewriting it — BR-011', () => {
    const result = GenerationConfigSchema.safeParse({ ...VALID, packageName: 'BadName' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid bin name', () => {
    expect(GenerationConfigSchema.safeParse({ ...VALID, binName: 'has space' }).success).toBe(false);
  });

  it('requires at least one transport', () => {
    expect(GenerationConfigSchema.safeParse({ ...VALID, transports: [] }).success).toBe(false);
  });

  it('rejects an unrecognized transport value', () => {
    expect(GenerationConfigSchema.safeParse({ ...VALID, transports: ['websocket'] }).success).toBe(false);
  });

  it('rejects an unrecognized mode', () => {
    expect(GenerationConfigSchema.safeParse({ ...VALID, mode: 'vendored' }).success).toBe(false);
  });

  it('rejects an unknown extra key', () => {
    expect(GenerationConfigSchema.safeParse({ ...VALID, houseBrand: '@mcpgen' }).success).toBe(false);
  });
});
