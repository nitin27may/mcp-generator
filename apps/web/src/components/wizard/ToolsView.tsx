'use client';

import { useState } from 'react';
import type { ToolConfig } from '@mcpgen/config-schema';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { OperationTable, type OperationRow } from '@/components/tools/OperationTable';
import { ToolFilters, type EnabledFilter, type RiskFilter } from '@/components/tools/ToolFilters';
import { ToolDesignerPanel } from '@/components/tools/ToolDesignerPanel';
import { SaveIndicator } from '@/components/wizard/SaveIndicator';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { SaveErrorBanner } from '@/components/wizard/SaveErrorBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useProjectQuery } from '@/api-client/queries';
import { useWizardDispatch, useWizardState } from '@/wizard/useWizard';
import { cn } from '@/lib/utils';
import { en } from '@/i18n/en';

export function ToolsView({ projectId }: { projectId: string }) {
  const { configDraft, saveStatus } = useWizardState();
  const dispatch = useWizardDispatch();
  const operationsQuery = useProjectQuery(projectId, ['operations', 'analysis']);

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');

  if (!configDraft) return null;
  const operations = operationsQuery.data?.operations ?? [];

  const rows: OperationRow[] = operations
    .filter((op) => {
      if (riskFilter !== 'all' && op.risk.classification !== riskFilter) return false;
      const tool = configDraft.tools[op.id];
      if (!tool) return false;
      if (enabledFilter === 'enabled' && !tool.enabled) return false;
      if (enabledFilter === 'disabled' && tool.enabled) return false;
      const query = search.trim().toLowerCase();
      if (query.length > 0) {
        const haystack = `${op.path} ${op.tags.join(' ')} ${tool.name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .map((op) => ({ summary: op, tool: configDraft.tools[op.id]! }))
    .sort((a, b) => {
      if (sortDirection === null) return 0;
      const cmp = a.summary.path.localeCompare(b.summary.path);
      return sortDirection === 'asc' ? cmp : -cmp;
    });

  function updateTool(operationId: string, tool: ToolConfig) {
    if (!configDraft) return;
    dispatch({ type: 'CONFIG_DRAFT_CHANGED', config: { ...configDraft, tools: { ...configDraft.tools, [operationId]: tool } } });
  }

  function toggleEnabled(operationId: string) {
    const tool = configDraft?.tools[operationId];
    if (!tool) return;
    updateTool(operationId, { ...tool, enabled: !tool.enabled });
  }

  function bulkSetEnabled(enabled: boolean) {
    if (!configDraft) return;
    const next = { ...configDraft.tools };
    for (const row of rows) next[row.summary.id] = { ...row.tool, enabled };
    dispatch({ type: 'CONFIG_DRAFT_CHANGED', config: { ...configDraft, tools: next } });
  }

  const selectedOperation = selectedId !== null ? operations.find((op) => op.id === selectedId) : undefined;
  const hasEnabledTool = Object.values(configDraft.tools).some((tool) => tool.enabled);

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <SaveErrorBanner />
      <Card>
        <CardHeader className="flex flex-row items-center justify-end">
          <SaveIndicator status={saveStatus} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">

          <ToolFilters
            search={search}
            onSearchChange={setSearch}
            riskFilter={riskFilter}
            onRiskFilterChange={setRiskFilter}
            enabledFilter={enabledFilter}
            onEnabledFilterChange={setEnabledFilter}
            onEnableAllShown={() => bulkSetEnabled(true)}
            onDisableAllShown={() => bulkSetEnabled(false)}
          />

          <p className="text-xs text-muted-foreground">{en.toolsCount(rows.length, operations.length)}</p>

          {operationsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{en.toolsLoading}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{en.toolsNoResults}</p>
          ) : (
            <div className={cn('grid gap-4', selectedOperation ? 'grid-cols-[1fr_360px]' : 'grid-cols-1')}>
              <OperationTable
                rows={rows}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggleEnabled={toggleEnabled}
                sortDirection={sortDirection}
                onToggleSort={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              />
              {selectedOperation && (
                <ToolDesignerPanel
                  projectId={projectId}
                  operation={selectedOperation}
                  configDraft={configDraft}
                  onChange={(tool) => updateTool(selectedOperation.id, tool)}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <StepFooter
        backHref={`/projects/${projectId}/auth`}
        continueHref={`/projects/${projectId}/bindings`}
        continueDisabled={!hasEnabledTool}
        continueLabel={en.toolsContinue}
      />
    </div>
  );
}
