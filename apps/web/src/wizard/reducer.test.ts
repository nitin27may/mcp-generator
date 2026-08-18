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
  it('PROJECT_LOADED sets projectId/snapshot/configDraft and clears errors and dirty', () => {
    const dirty: WizardState = { ...initialWizardState, dirty: true, errors: [{ code: 'X', message: 'x', category: 'IMPORT' }] };
    const next = wizardReducer(dirty, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    expect(next.projectId).toBe('11111111-1111-4111-8111-111111111111');
    expect(next.snapshot).not.toBeNull();
    expect(next.configDraft).toEqual(snapshot().config);
    expect(next.dirty).toBe(false);
    expect(next.errors).toEqual([]);
  });

  it('CONFIG_DRAFT_CHANGED replaces the draft and marks dirty', () => {
    const loaded = wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    const newConfig = { ...loaded.configDraft!, project: { name: 'Renamed' } };
    const next = wizardReducer(loaded, { type: 'CONFIG_DRAFT_CHANGED', config: newConfig });
    expect(next.configDraft).toBe(newConfig);
    expect(next.dirty).toBe(true);
  });

  it('SAVE_STARTED sets saveStatus to saving without touching the draft', () => {
    const loaded = wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    const next = wizardReducer(loaded, { type: 'SAVE_STARTED' });
    expect(next.saveStatus).toBe('saving');
    expect(next.configDraft).toBe(loaded.configDraft);
  });

  it('SAVE_SUCCEEDED replaces snapshot/configDraft, clears dirty, and marks saved', () => {
    const dirty: WizardState = { ...wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() }), dirty: true, saveStatus: 'saving' };
    const savedSnapshot = snapshot({ configRevision: 2 });
    const next = wizardReducer(dirty, { type: 'SAVE_SUCCEEDED', snapshot: savedSnapshot });
    expect(next.snapshot?.configRevision).toBe(2);
    expect(next.dirty).toBe(false);
    expect(next.saveStatus).toBe('saved');
  });

  it('SAVE_CONFLICTED records the server revision without discarding the local draft', () => {
    const loaded: WizardState = { ...wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() }), dirty: true };
    const next = wizardReducer(loaded, { type: 'SAVE_CONFLICTED', serverRevision: 5 });
    expect(next.saveStatus).toBe('conflict');
    expect(next.conflictServerRevision).toBe(5);
    expect(next.configDraft).toBe(loaded.configDraft);
  });

  it('SAVE_FAILED sets saveStatus to error and populates errors', () => {
    const loaded = wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    const errors = [{ code: 'CFG-001', message: 'bad', category: 'VALIDATION' as const }];
    const next = wizardReducer(loaded, { type: 'SAVE_FAILED', errors });
    expect(next.saveStatus).toBe('error');
    expect(next.errors).toEqual(errors);
  });

  it('CONFLICT_RELOADED adopts the server snapshot and clears the conflict', () => {
    const conflicted: WizardState = { ...wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() }), saveStatus: 'conflict', conflictServerRevision: 3, dirty: true };
    const serverSnapshot = snapshot({ configRevision: 3 });
    const next = wizardReducer(conflicted, { type: 'CONFLICT_RELOADED', snapshot: serverSnapshot });
    expect(next.snapshot?.configRevision).toBe(3);
    expect(next.dirty).toBe(false);
    expect(next.saveStatus).toBe('idle');
    expect(next.conflictServerRevision).toBeNull();
  });

  it('CONFLICT_OVERWRITE_ACCEPTED adopts the server revision but keeps the local draft', () => {
    const loaded = wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    const newConfig = { ...loaded.configDraft!, project: { name: 'My Edit' } };
    const edited = wizardReducer(loaded, { type: 'CONFIG_DRAFT_CHANGED', config: newConfig });
    const conflicted = wizardReducer(edited, { type: 'SAVE_CONFLICTED', serverRevision: 7 });
    const next = wizardReducer(conflicted, { type: 'CONFLICT_OVERWRITE_ACCEPTED' });
    expect(next.snapshot?.configRevision).toBe(7);
    expect(next.configDraft).toBe(newConfig); // local edits preserved
    expect(next.saveStatus).toBe('idle');
    expect(next.dirty).toBe(true);
  });

  it('CONFLICT_OVERWRITE_ACCEPTED is a no-op when there is no active conflict', () => {
    const loaded = wizardReducer(initialWizardState, { type: 'PROJECT_LOADED', snapshot: snapshot() });
    const next = wizardReducer(loaded, { type: 'CONFLICT_OVERWRITE_ACCEPTED' });
    expect(next).toBe(loaded);
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
