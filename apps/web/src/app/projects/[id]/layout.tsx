import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { WizardProvider } from '@/wizard/WizardProvider';
import { AutosaveController } from '@/components/wizard/AutosaveController';
import { InvalidIdError } from '@/server/paths';
import { readProjectCanonicalApi, readProjectConfig, readProjectRecord, readProjectSourceMeta } from '@/server/project-store';
import { buildProjectSnapshot } from '@/server/snapshot';

/**
 * Server Component — loads the project snapshot by calling `src/server/*`
 * directly (same process, no network hop) so first paint has real content.
 * Mirrors `GET /api/projects/:id`, which the browser uses for refetches.
 */
export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;

  let record;
  try {
    record = await readProjectRecord(id);
  } catch (error) {
    if (error instanceof InvalidIdError) notFound();
    throw error;
  }
  if (!record) notFound();

  const [config, canonicalApi, sourceMeta] = await Promise.all([
    readProjectConfig(id),
    readProjectCanonicalApi(id, record.currentSourceVersion),
    readProjectSourceMeta(id, record.currentSourceVersion),
  ]);
  if (!config || !canonicalApi || !sourceMeta) notFound();

  const snapshot = await buildProjectSnapshot(record, config, canonicalApi, sourceMeta);

  return (
    <WizardProvider initialSnapshot={snapshot}>
      <AutosaveController />
      {children}
    </WizardProvider>
  );
}
