import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { en } from '@/i18n/en';

/**
 * A real `<Link>` styled with `buttonVariants`, not `Button` with a `render`
 * prop — Base UI's `Button` always exposes `role="button"` to the
 * accessibility tree regardless of the underlying element (confirmed via a
 * real Playwright run), which is wrong for a control that navigates: WAI-ARIA
 * distinguishes links (navigate, support "open in new tab") from buttons
 * (perform an action in place). `Button` stays reserved for actual actions.
 */
export function StepFooter({
  backHref,
  continueHref,
  continueDisabled,
  continueLabel = 'Continue',
  skipHref,
  skipLabel = en.stepSkip,
}: {
  backHref?: string;
  continueHref?: string;
  continueDisabled?: boolean;
  continueLabel?: string;
  /**
   * Set only on steps `isStepOptional` says may be *presented* as skippable.
   * Functionally identical to Continue — nothing on these steps is gated — but
   * the label is the whole point: users had no way to tell which steps they
   * could safely click past.
   */
  skipHref?: string;
  skipLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-3">
      {backHref !== undefined ? (
        <Link href={backHref} className={cn(buttonVariants({ variant: 'outline' }))}>
          Back
        </Link>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-4">
        {skipHref !== undefined && (
          <Link
            href={skipHref}
            className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {skipLabel}
          </Link>
        )}
        {continueHref !== undefined &&
          (continueDisabled ? (
            <Button disabled>{continueLabel}</Button>
          ) : (
            <Link href={continueHref} className={cn(buttonVariants({ variant: 'default' }))}>
              {continueLabel}
            </Link>
          ))}
      </div>
    </div>
  );
}
