import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { BindingsView } from '@/components/wizard/BindingsView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function BindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="bindings" title={en.bindingsTitle} subtitle={en.bindingsSubtitle}>
      <BindingsView projectId={id} />
    </StepShell>
  );
}
