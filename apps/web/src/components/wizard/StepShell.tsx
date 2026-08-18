'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);

  // Move focus to the new step's heading on every step transition — App Router doesn't
  // reset focus like a traditional MPA does, so without this a screen-reader user's focus
  // silently stays on whatever control they clicked in the previous step. Skip on first
  // mount so we don't steal focus from the browser's own initial-load behavior.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [pathname]);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[220px_1fr] gap-8 px-6 py-8">
      <aside>
        <StepNav projectId={projectId} currentStepId={currentStepId} />
      </aside>
      <main id="main-content" className="flex flex-col gap-4">
        <header>
          <h1 ref={headingRef} tabIndex={-1} className="font-heading text-xl font-medium outline-none">
            {title}
          </h1>
          {subtitle !== undefined && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}
