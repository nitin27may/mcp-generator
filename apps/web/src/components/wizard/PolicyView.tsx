'use client';

import type { RetryConfig, ToolRisk } from '@mcpgen/config-schema';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RiskOverrideCell } from '@/components/policy/RiskOverrideCell';
import { RetryToggle } from '@/components/policy/RetryToggle';
import { SaveIndicator } from '@/components/wizard/SaveIndicator';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { SaveErrorBanner } from '@/components/wizard/SaveErrorBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useProjectQuery } from '@/api-client/queries';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

export function PolicyView({ projectId }: { projectId: string }) {
  const { configDraft, saveStatus } = useWizardState();
  const dispatch = useWizardDispatch();
  const operationsQuery = useProjectQuery(projectId, ['operations']);

  if (!configDraft) return null;

  const suggestedById = new Map((operationsQuery.data?.operations ?? []).map((op) => [op.id, op.risk]));
  const enabledTools = Object.entries(configDraft.tools).filter(([, tool]) => tool.enabled);

  function updateRisk(operationId: string, risk: ToolRisk) {
    if (!configDraft) return;
    const tool = configDraft.tools[operationId];
    if (!tool) return;
    dispatch({ type: 'CONFIG_DRAFT_CHANGED', config: { ...configDraft, tools: { ...configDraft.tools, [operationId]: { ...tool, risk } } } });
  }

  function updateRetry(operationId: string, retry: RetryConfig | undefined) {
    if (!configDraft) return;
    const tool = configDraft.tools[operationId];
    if (!tool) return;
    const { retry: _current, ...toolWithoutRetry } = tool;
    dispatch({
      type: 'CONFIG_DRAFT_CHANGED',
      config: { ...configDraft, tools: { ...configDraft.tools, [operationId]: retry !== undefined ? { ...toolWithoutRetry, retry } : toolWithoutRetry } },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <SaveErrorBanner />
      <Card>
        <CardHeader className="flex flex-row items-center justify-end">
          <SaveIndicator status={saveStatus} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="warning">
            <Info aria-hidden="true" />
            <AlertDescription>{en.policyNoConfirmationNote}</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <Info aria-hidden="true" />
            <AlertDescription>{en.policyRetryFloorNote}</AlertDescription>
          </Alert>

          {enabledTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">{en.policyNoEnabledTools}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">{en.policyColumnTool}</th>
                  <th className="py-2 pr-2 font-medium">{en.policyColumnRisk}</th>
                  <th className="py-2 pr-2 font-medium">{en.policyColumnRetry}</th>
                </tr>
              </thead>
              <tbody>
                {enabledTools.map(([operationId, tool]) => (
                  <tr key={operationId} className="border-b align-top last:border-0">
                    <td className="py-2 pr-2">
                      <span className="font-mono text-xs">{tool.name}</span>
                      <div className="text-xs text-muted-foreground">
                        {tool.sourceOperation.method} {tool.sourceOperation.path}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <RiskOverrideCell
                        value={tool.risk}
                        suggested={suggestedById.get(operationId)}
                        onChange={(risk) => updateRisk(operationId, risk)}
                        idPrefix={`policy-${operationId}`}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <RetryToggle value={tool.retry} risk={tool.risk} onChange={(retry) => updateRetry(operationId, retry)} idPrefix={`policy-${operationId}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <StepFooter
        backHref={`/projects/${projectId}/bindings`}
        continueHref={`/projects/${projectId}/playground`}
        continueLabel={en.policyContinue}
        skipHref={`/projects/${projectId}/playground`}
      />
    </div>
  );
}
