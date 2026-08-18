'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ProjectSnapshot } from '@mcpgen/control-contracts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/api-client/client';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

/** D2: a revision conflict never silently clobbers — the user picks "reload" (discard local edits, adopt the server's config) or "keep mine" (retry the save against the server's current revision, local edits intact). */
export function ConflictBanner({ projectId }: { projectId: string }) {
  const { saveStatus, conflictServerRevision } = useWizardState();
  const dispatch = useWizardDispatch();
  const [reloading, setReloading] = useState(false);

  if (saveStatus !== 'conflict' || conflictServerRevision === null) return null;

  async function handleReload() {
    setReloading(true);
    const response = await apiGet<ProjectSnapshot>(`/api/projects/${projectId}`);
    dispatch({ type: 'CONFLICT_RELOADED', snapshot: response.data });
    setReloading(false);
  }

  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{en.conflictTitle}</AlertTitle>
      <AlertDescription>{en.conflictBody}</AlertDescription>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" disabled={reloading} onClick={() => void handleReload()}>
          {reloading ? en.conflictReloading : en.conflictReload}
        </Button>
        <Button size="sm" onClick={() => dispatch({ type: 'CONFLICT_OVERWRITE_ACCEPTED' })}>
          {en.conflictKeepMine}
        </Button>
      </div>
    </Alert>
  );
}
