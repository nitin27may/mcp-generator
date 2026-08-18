import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { describe, expect, it } from 'vitest';
import { wizardReducer } from './reducer';
import { initialWizardState, type WizardState } from './state';

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test Project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configRevision: 1,
    source: { version: 1, format: 'json', declaredVersion: '3.1', rawFingerprint: 'fp', origin: { type: 'paste' } },
    api: { info: { title: 'X', version: '1' }, servers: [], securitySchemes: [], operationCount: 0 },
    config: { schemaVersion: '1.0', project: { name: 'Test Project' }, api: { baseUrl: { source: 'environment', name: 'X_BASE_URL' } }, tools: {}, generation: { packageName: 'x', binName: 'x', version: '0.1.0', transports: ['stdio'], emitDockerfile: false, mode: 'self-contained' } },
    importDiagnostics: [],
    gates: {
      import: { reachable: true, complete: true },
      validation: { reachable: true, complete: true },
      readiness: { reachable: true, complete: true },
      api: { reachable: true, complete: true },
      auth: { reachable: true, complete: true },
      tools: { reachable: true, complete: false },
      bindings: { reachable: false, complete: false },
      policy: { reachable: false, complete: false },
      playground: { reachable: true, complete: true },
      generate: { reachable: false, complete: false },
    },
    ...overrides,
  };
}

describe('wizardReducer', () => {
  it('PROJECT_LOADED sets projectId/snapshot and clears errors', () => {
    const dirty: WizardState = { ...initialWizardState, errors: [{ code: 'X', message: 'x', category: 'IMPORT' }] };
    const next = wizardReducer(dirty, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    expect(next.projectId).toBe('11111111-1111-4111-8111-111111111111');
    expect(next.snapshot).not.toBeNull();
    expect(next.errors).toEqual([]);
  });

  it('ERRORS_SET replaces the error list', () => {
    const errors = [{ code: 'IMP-003', message: 'bad', category: 'IMPORT' as const }];
    const next = wizardReducer(initialWizardState, { type: 'ERRORS_SET', errors });
    expect(next.errors).toEqual(errors);
  });

  it('ERRORS_DISMISSED clears the error list', () => {
    const withErrors: WizardState = { ...initialWizardState, errors: [{ code: 'X', message: 'x', category: 'IMPORT' }] };
    const next = wizardReducer(withErrors, { type: 'ERRORS_DISMISSED' });
    expect(next.errors).toEqual([]);
  });

  it('ERRORS_DISMISSED returns the same object reference when there is nothing to clear', () => {
    const next = wizardReducer(initialWizardState, { type: 'ERRORS_DISMISSED' });
    expect(next).toBe(initialWizardState);
  });

  it('an unknown action returns the same state reference (exhaustiveness fallback)', () => {
    const unknownAction = { type: 'NOT_A_REAL_ACTION' } as unknown as Parameters<typeof wizardReducer>[1];
    expect(wizardReducer(initialWizardState, unknownAction)).toBe(initialWizardState);
  });
});
