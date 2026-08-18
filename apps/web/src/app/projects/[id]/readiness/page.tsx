import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { ReadinessView } from '@/components/wizard/ReadinessView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function ReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="readiness" title={en.stepReadiness} subtitle={en.readinessSubtitle}>
      <ReadinessView projectId={id} />
    </StepShell>
  );
}
