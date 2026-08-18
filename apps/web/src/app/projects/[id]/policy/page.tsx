import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { PolicyView } from '@/components/wizard/PolicyView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="policy" title={en.policyTitle} subtitle={en.policySubtitle}>
      <PolicyView projectId={id} />
    </StepShell>
  );
}
