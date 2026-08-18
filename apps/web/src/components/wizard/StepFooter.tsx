import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
        <Button variant="outline" render={<Link href={backHref}>Back</Link>} />
      ) : (
        <span />
      )}
      {continueHref !== undefined &&
        (continueDisabled ? (
          <Button disabled>{continueLabel}</Button>
        ) : (
          <Button render={<Link href={continueHref}>{continueLabel}</Link>} />
        ))}
    </div>
  );
}
