import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown while a server component streams. Mirrors the wizard's own shape — nav strip and
 * a content column — so the layout does not jump when the real page arrives.
 */
export default function Loading() {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-8">
      <div className="flex gap-1 lg:flex-col lg:gap-1.5" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-24 shrink-0 lg:w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  );
}
