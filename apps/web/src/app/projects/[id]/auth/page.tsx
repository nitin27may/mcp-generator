import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { AuthView } from '@/components/wizard/AuthView';
import { readProjectRecord } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function AuthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  return (
    <StepShell projectId={id} currentStepId="auth" title={en.authTitle} subtitle={en.authSubtitle}>
      <AuthView projectId={id} />
    </StepShell>
  );
}
