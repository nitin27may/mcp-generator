import { describe, expect, it } from 'vitest';
import { normalizeOperationPath } from './operation-identity.js';

describe('normalizeOperationPath', () => {
  it('collapses a single path parameter', () => {
    expect(normalizeOperationPath('/customers/{customerId}')).toBe('/customers/{}');
  });

  it('collapses multiple path parameters', () => {
    expect(normalizeOperationPath('/orgs/{orgId}/repos/{repoId}')).toBe('/orgs/{}/repos/{}');
  });

  it('makes a cosmetic parameter rename normalize identically — the fallback identity tier', () => {
    // TIP §7 fallback tier is `method + normalized path`; a rename from {id} to
    // {petId} must not silently create a second operation identity.
    expect(normalizeOperationPath('/pets/{id}')).toBe(normalizeOperationPath('/pets/{petId}'));
  });

  it('leaves a path with no parameters unchanged', () => {
    expect(normalizeOperationPath('/customers')).toBe('/customers');
  });
});
