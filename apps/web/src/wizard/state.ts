import type { McpProjectConfig } from '@mcpgen/config-schema';
import type { ProductError, ProjectSnapshot, WizardStepId } from '@mcpgen/control-contracts';
export type { WizardStepId };

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

/**
 * D3: the reducer owns only the config draft + pure UI state; TanStack
 * Query owns everything server-derived (`analysis`, `operations`, etc. live
 * inside `snapshot`, refetched independently — never copied out here).
 * `configDraft` starts as a copy of `snapshot.config` and is what every
 * editable step mutates; `useConfigAutosave` is what turns a dirty draft
 * back into a saved `snapshot`.
 */
export interface WizardState {
  readonly projectId: string | null;
  readonly snapshot: ProjectSnapshot | null;
  readonly configDraft: McpProjectConfig | null;
  readonly dirty: boolean;
  readonly saveStatus: SaveStatus;
  readonly conflictServerRevision: number | null;
  readonly errors: readonly ProductError[];
}

export type WizardAction =
  | { readonly type: 'PROJECT_LOADED'; readonly snapshot: ProjectSnapshot }
  | { readonly type: 'CONFIG_DRAFT_CHANGED'; readonly config: McpProjectConfig }
  | { readonly type: 'SAVE_STARTED' }
  | { readonly type: 'SAVE_SUCCEEDED'; readonly snapshot: ProjectSnapshot }
  | { readonly type: 'SAVE_CONFLICTED'; readonly serverRevision: number }
  | { readonly type: 'SAVE_FAILED'; readonly errors: readonly ProductError[] }
  | { readonly type: 'CONFLICT_RELOADED'; readonly snapshot: ProjectSnapshot }
  | { readonly type: 'CONFLICT_OVERWRITE_ACCEPTED' }
  | { readonly type: 'ERRORS_SET'; readonly errors: readonly ProductError[] }
  | { readonly type: 'ERRORS_DISMISSED' };

export const initialWizardState: WizardState = {
  projectId: null,
  snapshot: null,
  configDraft: null,
  dirty: false,
  saveStatus: 'idle',
  conflictServerRevision: null,
  errors: [],
};
