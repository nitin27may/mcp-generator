'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { WIZARD_STEPS, type WizardStepId } from '@mcpgen/control-contracts';
import { useWizardState } from '@/wizard/useWizard';
import { cn } from '@/lib/utils';

/**
 * Unreachable steps stay in the DOM (rendered `aria-disabled`, not removed)
 * so screen-reader users still get the full step list and the reason a step
 * isn't reachable yet — enforcement of the gate is server-side on the
 * expensive routes, not here (TIP §51).
 */
export function StepNav({ currentStepId, projectId }: { currentStepId: WizardStepId; projectId: string }) {
  const { snapshot } = useWizardState();

  return (
    <nav aria-label="Wizard steps">
      <ol className="flex flex-col gap-0.5">
        {WIZARD_STEPS.map((step) => {
          const gate = snapshot?.gates[step.id];
          const reachable = gate?.reachable ?? step.id === 'validation';
          const isCurrent = step.id === currentStepId;
          const isComplete = gate?.complete === true;
          const href = `/projects/${projectId}/${step.id}`;

          return (
            <li key={step.id}>
              {reachable ? (
                <Link
                  href={href}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted',
                    isCurrent && 'bg-primary/10 font-medium text-primary',
                    !isCurrent && isComplete && 'text-foreground',
                    !isCurrent && !isComplete && 'text-muted-foreground',
                  )}
                >
                  {isComplete && !isCurrent ? (
                    <Check aria-hidden="true" className="size-3.5 shrink-0 text-success" />
                  ) : (
                    <span aria-hidden="true" className="w-3.5 shrink-0 text-center text-xs tabular-nums">{step.order + 1}</span>
                  )}
                  {step.label}
                  {isComplete && <span className="sr-only"> (complete)</span>}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  aria-label={gate?.blockedBy !== undefined ? `${step.label} — ${gate.blockedBy}` : step.label}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/50"
                >
                  <span aria-hidden="true" className="text-xs tabular-nums">{step.order + 1}</span>
                  {step.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
