import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { GenerateView } from '@/components/wizard/GenerateView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function GeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="generate" title={en.generateTitle} subtitle={en.generateSubtitle}>
      <GenerateView projectId={id} />
    </StepShell>
  );
}
