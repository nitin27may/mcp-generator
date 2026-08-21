'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isStepOptional, type WizardStepId } from '@mcpgen/control-contracts';
import { useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';
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
  const { snapshot, configDraft } = useWizardState();
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

  const hasUpstreamAuth = (configDraft ?? snapshot?.config)?.upstreamAuthentication !== undefined;
  const optional = isStepOptional(currentStepId, { hasUpstreamAuth });

  // Below `lg` the sidebar becomes a horizontal strip above the content rather than a
  // 220px column beside it. The fixed two-column grid used to apply at every width, so at
  // 375px the main column was left with roughly 75px — every one of the nine wizard routes
  // was unusable on a phone, from this one line.
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-8">
      <aside className="min-w-0">
        {snapshot && <p className="mb-3 truncate px-2.5 text-xs font-medium text-muted-foreground" title={snapshot.name}>{snapshot.name}</p>}
        <StepNav projectId={projectId} currentStepId={currentStepId} />
      </aside>
      <main id="main-content" className="flex min-w-0 flex-col gap-4">
        <header>
          <h1 ref={headingRef} tabIndex={-1} className="font-heading text-xl font-medium outline-none">
            {title}
          </h1>
          {subtitle !== undefined && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {optional && <p className="mt-1 text-sm text-muted-foreground">{en.stepOptionalHint}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}
