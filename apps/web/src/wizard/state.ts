import type { ProductError, ProjectSnapshot, WizardStepId } from '@mcpgen/control-contracts';

export type { WizardStepId };

/**
 * The reducer owns the project id/snapshot pointer and pure UI state only —
 * TanStack Query owns the actual fetching/caching of server data (the
 * snapshot's *content* lives in the query cache; `PROJECT_LOADED` here just
 * records "this is the current project" for step-gating and copies the
 * latest snapshot in so gates/diagnostics render without waiting on a
 * second round trip). Extended incrementally as later steps land — no
 * speculative fields for tools/bindings/playground state that nothing
 * reads yet.
 */
export interface WizardState {
  readonly projectId: string | null;
  readonly snapshot: ProjectSnapshot | null;
  readonly errors: readonly ProductError[];
}

export type WizardAction =
  | { readonly type: 'PROJECT_LOADED'; readonly snapshot: ProjectSnapshot }
  | { readonly type: 'ERRORS_SET'; readonly errors: readonly ProductError[] }
  | { readonly type: 'ERRORS_DISMISSED' };

export const initialWizardState: WizardState = {
  projectId: null,
  snapshot: null,
  errors: [],
};
