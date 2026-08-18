import type { WizardAction, WizardState } from './state';

/** Pure `(state, action) => state`. Total — the `noFallthroughCasesInSwitch`/`noImplicitReturns` tsconfig flags plus the exhaustive default arm make an unhandled action a compile error, not a silent no-op. */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'PROJECT_LOADED':
      return {
        ...state,
        projectId: action.snapshot.id,
        snapshot: action.snapshot,
        configDraft: action.snapshot.config,
        dirty: false,
        saveStatus: 'idle',
        conflictServerRevision: null,
        errors: [],
      };
    case 'CONFIG_DRAFT_CHANGED':
      return { ...state, configDraft: action.config, dirty: true };
    case 'SAVE_STARTED':
      return { ...state, saveStatus: 'saving' };
    case 'SAVE_SUCCEEDED':
      return { ...state, snapshot: action.snapshot, configDraft: action.snapshot.config, dirty: false, saveStatus: 'saved', conflictServerRevision: null };
    case 'SAVE_CONFLICTED':
      return { ...state, saveStatus: 'conflict', conflictServerRevision: action.serverRevision };
    case 'SAVE_FAILED':
      return { ...state, saveStatus: 'error', errors: action.errors };
    case 'CONFLICT_RELOADED':
      return { ...state, snapshot: action.snapshot, configDraft: action.snapshot.config, dirty: false, saveStatus: 'idle', conflictServerRevision: null };
    case 'CONFLICT_OVERWRITE_ACCEPTED':
      return state.snapshot && state.conflictServerRevision !== null
        ? { ...state, snapshot: { ...state.snapshot, configRevision: state.conflictServerRevision }, saveStatus: 'idle', conflictServerRevision: null, dirty: true }
        : state;
    case 'ERRORS_SET':
      return { ...state, errors: action.errors };
    case 'ERRORS_DISMISSED':
      return state.errors.length === 0 ? state : { ...state, errors: [] };
    default:
      // Exhaustiveness check: if a new WizardAction variant is added without a case above,
      // `action` stops being assignable to `never` and this line fails to compile (TIP §93 C23).
      return ((_: never) => state)(action);
  }
}
