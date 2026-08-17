import { describe, expect, it } from 'vitest';
import { isValidBinName, isValidNpmPackageName } from './npm-name.js';

describe('isValidNpmPackageName', () => {
  it.each(['customer-mcp', 'customer_mcp', 'customer.mcp', 'a', '@acme/customer-mcp', '@acme/x'])(
    'accepts %s',
    (name) => {
      expect(isValidNpmPackageName(name)).toBe(true);
    },
  );

  it.each([
    ['', 'empty'],
    ['BadName', 'uppercase'],
    ['.starts-with-dot', 'leading dot'],
    ['_starts-with-underscore', 'leading underscore'],
    ['has space', 'contains a space'],
    ['@Acme/x', 'uppercase scope'],
    ['@acme/', 'empty name after scope'],
    ['a'.repeat(215), 'exceeds 214 characters'],
  ])('rejects %s (%s)', (name) => {
    expect(isValidNpmPackageName(name)).toBe(false);
  });

  it('accepts exactly 214 characters', () => {
    expect(isValidNpmPackageName('a'.repeat(214))).toBe(true);
  });
});

describe('isValidBinName', () => {
  it.each(['customer-mcp', 'customer_mcp', 'customer.mcp', 'CustomerMcp', 'x'])('accepts %s', (name) => {
    expect(isValidBinName(name)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['has space', 'contains a space'],
    ['has/slash', 'contains a slash'],
    ['a'.repeat(65), 'exceeds 64 characters'],
  ])('rejects %s (%s)', (name) => {
    expect(isValidBinName(name)).toBe(false);
  });
});
