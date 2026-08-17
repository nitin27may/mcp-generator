import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostic.js';
import { isStageOk, stageFail, stageOk } from './stage-result.js';

const error: Diagnostic = { severity: 'error', code: 'X-001', message: 'bad' };
const warning: Diagnostic = { severity: 'warning', code: 'X-002', message: 'meh' };

describe('stageOk', () => {
  it('carries the value forward with default empty diagnostics and stats', () => {
    const result = stageOk(42);
    expect(result).toEqual({ value: 42, diagnostics: [], stats: {} });
  });

  it('can carry a value alongside non-blocking diagnostics', () => {
    const result = stageOk(42, [warning]);
    expect(result.value).toBe(42);
    expect(result.diagnostics).toEqual([warning]);
  });
});

describe('stageFail', () => {
  it('has no value, only diagnostics', () => {
    const result = stageFail([error]);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([error]);
  });
});

describe('isStageOk', () => {
  it('is true for a value with no error-severity diagnostics', () => {
    expect(isStageOk(stageOk(1, [warning]))).toBe(true);
  });

  it('is false when there is no value', () => {
    expect(isStageOk(stageFail([error]))).toBe(false);
  });

  it('is false when a value is present but an error diagnostic undermines it', () => {
    // TIP §8.1: partial success is still recorded so downstream stages see it,
    // but it must not be mistaken for a clean result.
    expect(isStageOk(stageOk(1, [error]))).toBe(false);
  });
});
