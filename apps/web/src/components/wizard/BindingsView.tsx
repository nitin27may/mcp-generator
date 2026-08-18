'use client';

import { useState } from 'react';
import type { ValueBinding } from '@mcpgen/config-schema';
import { buildEnvVarSummary, computeBindingDiagnostics } from '@mcpgen/control-contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BindingTable } from '@/components/bindings/BindingTable';
import { EnvVarSummary } from '@/components/bindings/EnvVarSummary';
import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { SaveIndicator } from '@/components/wizard/SaveIndicator';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { SaveErrorBanner } from '@/components/wizard/SaveErrorBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useProjectQuery } from '@/api-client/queries';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

export function BindingsView({ projectId }: { projectId: string }) {
  const { configDraft, saveStatus } = useWizardState();
  const dispatch = useWizardDispatch();

  const enabledTools = configDraft ? Object.entries(configDraft.tools).filter(([, tool]) => tool.enabled) : [];
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(enabledTools[0]?.[0] ?? null);
  const toolSelectLabels = new Map(enabledTools.map(([operationId, tool]) => [operationId, `${tool.name} — ${tool.sourceOperation.method} ${tool.sourceOperation.path}`]));

  const detailQuery = useProjectQuery(projectId, ['operationDetail'], selectedOperationId ?? undefined);

  if (!configDraft) return null;

  function updateBindings(operationId: string, bindings: Record<string, ValueBinding>) {
    if (!configDraft) return;
    const tool = configDraft.tools[operationId];
    if (!tool) return;
    dispatch({ type: 'CONFIG_DRAFT_CHANGED', config: { ...configDraft, tools: { ...configDraft.tools, [operationId]: { ...tool, bindings } } } });
  }

  const selectedTool = selectedOperationId ? configDraft.tools[selectedOperationId] : undefined;
  const detail = detailQuery.data?.operationDetail;
  const liveErrors = detail && selectedTool ? computeBindingDiagnostics(detail, selectedTool.bindings) : [];
  const envSummary = buildEnvVarSummary(configDraft);

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <SaveErrorBanner />
      <Card>
        <CardHeader className="flex flex-row items-center justify-end">
          <SaveIndicator status={saveStatus} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">

          {enabledTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">{en.bindingsNoEnabledTools}</p>
          ) : (
            <>
              <Select value={selectedOperationId ?? undefined} onValueChange={(id) => id !== null && setSelectedOperationId(id)}>
                <SelectTrigger aria-label={en.bindingsToolSelectLabel}>
                  <SelectValue>{(id: string) => toolSelectLabels.get(id)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledTools.map(([operationId]) => (
                    <SelectItem key={operationId} value={operationId}>
                      {toolSelectLabels.get(operationId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ProductErrorPanel errors={liveErrors} />

              {detailQuery.isLoading && <p className="text-sm text-muted-foreground">{en.bindingsLoading}</p>}
              {detail && selectedOperationId && selectedTool && (
                <BindingTable detail={detail} bindings={selectedTool.bindings} onChange={(bindings) => updateBindings(selectedOperationId, bindings)} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{en.envSummaryTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{en.envSummarySubtitle}</p>
          <EnvVarSummary entries={envSummary} />
        </CardContent>
      </Card>

      <StepFooter backHref={`/projects/${projectId}/tools`} continueHref={`/projects/${projectId}/policy`} continueLabel={en.bindingsContinue} />
    </div>
  );
}
