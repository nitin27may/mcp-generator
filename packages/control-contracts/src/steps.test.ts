import { describe, expect, it } from 'vitest';
import { WIZARD_STEPS, isStepOptional } from './steps.js';

describe('WIZARD_STEPS', () => {
  it('orders steps contiguously from zero', () => {
    expect(WIZARD_STEPS.map((step) => step.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('marks only auth, policy and playground as baseline-optional', () => {
    expect(WIZARD_STEPS.filter((step) => step.optional).map((step) => step.id)).toEqual(['auth', 'policy', 'playground']);
  });
});

describe('isStepOptional', () => {
  it('never presents a gated or substantive step as skippable', () => {
    for (const id of ['import', 'validation', 'readiness', 'api', 'tools', 'bindings', 'generate'] as const) {
      expect(isStepOptional(id, { hasUpstreamAuth: false })).toBe(false);
      expect(isStepOptional(id, { hasUpstreamAuth: true })).toBe(false);
    }
  });

  it('presents safety and test as skippable regardless of auth', () => {
    for (const id of ['policy', 'playground'] as const) {
      expect(isStepOptional(id, { hasUpstreamAuth: false })).toBe(true);
      expect(isStepOptional(id, { hasUpstreamAuth: true })).toBe(true);
    }
  });

  it('presents auth as skippable only when the spec declared no security scheme', () => {
    expect(isStepOptional('auth', { hasUpstreamAuth: false })).toBe(true);
    expect(isStepOptional('auth', { hasUpstreamAuth: true })).toBe(false);
  });
});
