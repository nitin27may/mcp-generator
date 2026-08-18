import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { PlaygroundView } from '@/components/wizard/PlaygroundView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function PlaygroundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="playground" title={en.playgroundTitle} subtitle={en.playgroundSubtitle}>
      <PlaygroundView projectId={id} />
    </StepShell>
  );
}
