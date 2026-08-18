import { use } from 'react';
import { WizardDispatchContext, WizardStateContext } from './WizardProvider';

export function useWizardState() {
  const state = use(WizardStateContext);
  if (!state) throw new Error('useWizardState must be used inside a WizardProvider');
  return state;
}

export function useWizardDispatch() {
  const dispatch = use(WizardDispatchContext);
  if (!dispatch) throw new Error('useWizardDispatch must be used inside a WizardProvider');
  return dispatch;
}
