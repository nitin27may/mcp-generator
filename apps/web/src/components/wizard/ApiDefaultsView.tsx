'use client';

import type { EnvironmentBinding, StaticBinding } from '@mcpgen/config-schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ValueBindingField, type BindableValue } from '@/components/config/ValueBindingField';
import { SaveIndicator } from '@/components/wizard/SaveIndicator';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

export function ApiDefaultsView({ projectId }: { projectId: string }) {
  const { configDraft, saveStatus } = useWizardState();
  const dispatch = useWizardDispatch();

  if (!configDraft) return null;

  function handleBaseUrlChange(next: BindableValue) {
    if (!configDraft) return;
    // `allowedKinds` below restricts the field to environment/static only — `ApiRuntimeConfig.baseUrl`
    // doesn't accept a secret binding (a base URL isn't sensitive), so this narrowing is safe.
    dispatch({
      type: 'CONFIG_DRAFT_CHANGED',
      config: { ...configDraft, api: { baseUrl: next as EnvironmentBinding | StaticBinding } },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{en.apiDefaultsTitle}</CardTitle>
          <SaveIndicator status={saveStatus} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{en.apiDefaultsSubtitle}</p>
          <ValueBindingField
            label={en.apiDefaultsBaseUrlLabel}
            value={configDraft.api.baseUrl}
            onChange={handleBaseUrlChange}
            allowedKinds={['environment', 'static']}
            idPrefix="api-base-url"
          />
        </CardContent>
      </Card>

      <StepFooter backHref={`/projects/${projectId}/readiness`} continueHref={`/projects/${projectId}/auth`} continueLabel={en.apiDefaultsContinue} />
    </div>
  );
}
