'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { WIZARD_STEPS, isStepOptional, type WizardStepId } from '@mcpgen/control-contracts';
import { useWizardState } from '@/wizard/useWizard';
import { cn } from '@/lib/utils';
import { en } from '@/i18n/en';

/**
 * Unreachable steps stay in the DOM (rendered `aria-disabled`, not removed)
 * so screen-reader users still get the full step list and the reason a step
 * isn't reachable yet — enforcement of the gate is server-side on the
 * expensive routes, not here (TIP §51).
 */
export function StepNav({ currentStepId, projectId }: { currentStepId: WizardStepId; projectId: string }) {
  const { snapshot, configDraft } = useWizardState();

  // The draft is what the user is actually editing; the snapshot's config is
  // the last saved state and the only thing available before the draft loads.
  const hasUpstreamAuth = (configDraft ?? snapshot?.config)?.upstreamAuthentication !== undefined;

  return (
    <nav aria-label="Wizard steps">
      {/* Below `lg` the steps wrap onto a few rows instead of forming one 1240px-wide
          horizontally scrolling strip. Scrolling was tried first and measured worse in two
          ways: the strip's content escaped to the root, leaving the whole page draggable
          sideways over empty space (`overflow` on every ancestor failed to contain it), and
          it hid seven of the ten steps behind a gesture. Wrapping has no overflow to
          contain and keeps the whole path visible, which is the point of a step nav. */}
      <ol className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap lg:gap-0.5">
        {WIZARD_STEPS.map((step) => {
          const gate = snapshot?.gates[step.id];
          const reachable = gate?.reachable ?? step.id === 'validation';
          const isCurrent = step.id === currentStepId;
          const isComplete = gate?.complete === true;
          const optional = isStepOptional(step.id, { hasUpstreamAuth });
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
                  <span className="flex-1">{step.label}</span>
                  {optional && (
                    // Follows the row's own color, deliberately: `text-muted-foreground`
                    // (#737373) on the current step's `bg-primary/10` tint (#e8efff) is
                    // 4.11:1, under WCAG AA's 4.5:1 — caught by axe, same class of bug as
                    // TIP §93 C31's destructive-variant finding.
                    <span className={cn('shrink-0 text-xs font-normal', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
                      {en.stepOptional}
                    </span>
                  )}
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
