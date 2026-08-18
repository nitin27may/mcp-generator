import { notFound } from 'next/navigation';
import { StepShell } from '@/components/wizard/StepShell';
import { ValidationView } from '@/components/wizard/ValidationView';
import { readProjectCanonicalApi, readProjectRecord, readProjectSourceMeta, readProjectSourceRaw } from '@/server/project-store';
import { en } from '@/i18n/en';

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readProjectRecord(id);
  if (!record) notFound();

  const [canonicalApi, sourceMeta, rawSource] = await Promise.all([
    readProjectCanonicalApi(id, record.currentSourceVersion),
    readProjectSourceMeta(id, record.currentSourceVersion),
    readProjectSourceRaw(id, record.currentSourceVersion),
  ]);
  if (!canonicalApi || !sourceMeta || rawSource === undefined) notFound();

  return (
    <StepShell projectId={id} currentStepId="validation" title={en.validationTitle} subtitle={en.validationSubtitle}>
      <ValidationView projectId={id} diagnostics={canonicalApi.diagnostics} rawSource={rawSource} format={sourceMeta.format} />
    </StepShell>
  );
}
