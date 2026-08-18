'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlaygroundToolPanel } from '@/components/playground/PlaygroundToolPanel';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

export function PlaygroundView({ projectId }: { projectId: string }) {
  const { configDraft } = useWizardState();
  const enabledTools = configDraft ? Object.values(configDraft.tools).filter((tool) => tool.enabled) : [];
  const [selectedToolName, setSelectedToolName] = useState<string | null>(enabledTools[0]?.name ?? null);
  const toolSelectLabels = new Map(enabledTools.map((tool) => [tool.name, `${tool.name} — ${tool.sourceOperation.method} ${tool.sourceOperation.path}`]));

  if (!configDraft) return null;
  const selectedTool = selectedToolName ? enabledTools.find((tool) => tool.name === selectedToolName) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {enabledTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">{en.playgroundNoEnabledTools}</p>
          ) : (
            <>
              <Select value={selectedToolName ?? undefined} onValueChange={(name) => name !== null && setSelectedToolName(name)}>
                <SelectTrigger aria-label={en.playgroundToolSelectLabel}>
                  <SelectValue>{(name: string) => toolSelectLabels.get(name)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledTools.map((tool) => (
                    <SelectItem key={tool.name} value={tool.name}>
                      {toolSelectLabels.get(tool.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTool && <PlaygroundToolPanel key={selectedTool.name} projectId={projectId} config={configDraft} toolConfig={selectedTool} />}
            </>
          )}
        </CardContent>
      </Card>

      <StepFooter backHref={`/projects/${projectId}/policy`} continueHref={`/projects/${projectId}/generate`} continueLabel={en.playgroundContinue} />
    </div>
  );
}
