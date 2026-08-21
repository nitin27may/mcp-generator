import { cn } from '@/lib/utils';

/**
 * A loading placeholder. Purely decorative: every use is inside a container that carries
 * the actual `role="status"` announcement, so these are `aria-hidden` at the call site
 * rather than each announcing themselves.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
