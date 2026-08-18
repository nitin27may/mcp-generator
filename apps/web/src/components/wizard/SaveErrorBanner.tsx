'use client';

import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';

/**
 * `useConfigAutosave` dispatches `SAVE_FAILED` with the real `ProductError[]`
 * from a 422 (or any non-409, non-2xx) response, but until this component
 * existed nothing ever rendered `wizardState.errors` for that case — a
 * failed autosave was only visible as the word "Save failed" in
 * `SaveIndicator`, with no explanation of what's wrong or how to fix it.
 * Found via a real Playwright run (an empty OAuth2 token URL failing
 * schema validation on save) — every editable step needs this, not just
 * the ones that happened to already render errors for their own reasons.
 */
export function SaveErrorBanner() {
  const { saveStatus, errors } = useWizardState();
  const dispatch = useWizardDispatch();

  if (saveStatus !== 'error' || errors.length === 0) return null;

  return <ProductErrorPanel errors={errors} onDismiss={() => dispatch({ type: 'ERRORS_DISMISSED' })} />;
}
