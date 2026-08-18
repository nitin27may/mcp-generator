import type { ReactNode } from 'react';
import type { WizardStepId } from '@mcpgen/control-contracts';
import { StepNav } from './StepNav';

export function StepShell({
  projectId,
  currentStepId,
  title,
  subtitle,
  children,
}: {
  projectId: string;
  currentStepId: WizardStepId;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[220px_1fr] gap-8 px-6 py-8">
      <aside>
        <StepNav projectId={projectId} currentStepId={currentStepId} />
      </aside>
      <main id="main-content" className="flex flex-col gap-4">
        <header>
          <h1 className="font-heading text-xl font-medium">{title}</h1>
          {subtitle !== undefined && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}
