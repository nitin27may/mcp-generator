import { describe, expect, it } from 'vitest';
import { compareDiagnosticSeverity, hasErrors, type Diagnostic } from './diagnostic.js';

const diag = (severity: Diagnostic['severity'], code = 'X-001'): Diagnostic => ({
  severity,
  code,
  message: 'm',
});

describe('compareDiagnosticSeverity', () => {
  it('sorts error before warning before recommendation before info', () => {
    const items = [diag('info'), diag('error'), diag('recommendation'), diag('warning')];
    const sorted = [...items].sort(compareDiagnosticSeverity);
    expect(sorted.map((d) => d.severity)).toEqual(['error', 'warning', 'recommendation', 'info']);
  });

  it('treats equal severities as equal', () => {
    expect(compareDiagnosticSeverity(diag('warning'), diag('warning'))).toBe(0);
  });
});

describe('hasErrors', () => {
  it('is false for an empty list', () => {
    expect(hasErrors([])).toBe(false);
  });

  it('is false when no diagnostic is error-severity', () => {
    expect(hasErrors([diag('warning'), diag('info')])).toBe(false);
  });

  it('is true when at least one diagnostic is error-severity', () => {
    expect(hasErrors([diag('info'), diag('error')])).toBe(true);
  });
});
