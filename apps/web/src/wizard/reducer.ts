import type { WizardAction, WizardState } from './state';

/** Pure `(state, action) => state`. Total — the `noFallthroughCasesInSwitch`/`noImplicitReturns` tsconfig flags plus the exhaustive default arm make an unhandled action a compile error, not a silent no-op. */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'PROJECT_LOADED':
      return { ...state, projectId: action.snapshot.id, snapshot: action.snapshot, errors: [] };
    case 'ERRORS_SET':
      return { ...state, errors: action.errors };
    case 'ERRORS_DISMISSED':
      return state.errors.length === 0 ? state : { ...state, errors: [] };
    default:
      // Exhaustiveness check: if a new WizardAction variant is added without a case above,
      // `action` stops being assignable to `never` and this line fails to compile.
      return ((_: never) => state)(action);
  }
}
