import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { ToolsView } from '@/components/wizard/ToolsView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function ToolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="tools" title={en.toolsTitle} subtitle={en.toolsSubtitle}>
      <ToolsView projectId={id} />
    </StepShell>
  );
}
