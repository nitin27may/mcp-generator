'use client';

import { useConfigAutosave } from '@/wizard/useConfigAutosave';

/** No UI of its own — mounted once inside the project layout (persists across step navigation) purely to run the autosave side effect. `SaveIndicator`/`ConflictBanner` read `saveStatus` from wizard state directly. */
export function AutosaveController() {
  useConfigAutosave();
  return null;
}
