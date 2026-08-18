import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
}: {
  backHref?: string;
  continueHref?: string;
  continueDisabled?: boolean;
  continueLabel?: string;
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
      {continueHref !== undefined &&
        (continueDisabled ? (
          <Button disabled>{continueLabel}</Button>
        ) : (
          <Link href={continueHref} className={cn(buttonVariants({ variant: 'default' }))}>
            {continueLabel}
          </Link>
        ))}
    </div>
  );
}
