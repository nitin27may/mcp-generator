'use client';

import { createContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { wizardReducer } from './reducer';
import { initialWizardState, type WizardAction, type WizardState } from './state';

export const WizardStateContext = createContext<WizardState | undefined>(undefined);
export const WizardDispatchContext = createContext<Dispatch<WizardAction> | undefined>(undefined);

/**
 * `initialSnapshot`, when provided, comes from a Server Component that
 * already loaded the project (no network hop, no spinner on first paint) —
 * see `projects/[id]/layout.tsx`. Omitted on `/projects/new/import`, where
 * there's no project yet.
 */
export function WizardProvider({ children, initialSnapshot }: { children: ReactNode; initialSnapshot?: ProjectSnapshot }) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    initialSnapshot ? { ...initialWizardState, projectId: initialSnapshot.id, snapshot: initialSnapshot } : initialWizardState,
  );

  return (
    <WizardStateContext.Provider value={state}>
      <WizardDispatchContext.Provider value={dispatch}>{children}</WizardDispatchContext.Provider>
    </WizardStateContext.Provider>
  );
}
