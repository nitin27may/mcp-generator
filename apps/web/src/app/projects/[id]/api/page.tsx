import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { ApiDefaultsView } from '@/components/wizard/ApiDefaultsView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function ApiDefaultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="api" title={en.apiDefaultsTitle} subtitle={en.apiDefaultsSubtitle}>
      <ApiDefaultsView projectId={id} />
    </StepShell>
  );
}
