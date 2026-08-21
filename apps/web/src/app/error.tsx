'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { en } from '@/i18n/en';

/**
 * The route-level error boundary. A thrown server error previously rendered Next's stock
 * page, which offers no way back into the wizard and no indication that the work so far
 * is safe — it is: every step is persisted server-side as you go, so `reset()` re-renders
 * against the saved project rather than starting again.
 *
 * `error.message` is deliberately not shown. Server messages can carry a path or an
 * upstream response, and this component cannot tell which are safe (ADR-0006). The digest
 * is the correlator for the server log, which is where the detail belongs.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
      <AlertTriangle aria-hidden="true" className="size-10 text-destructive" />
      <h1 className="font-heading text-2xl font-medium tracking-tight text-balance">{en.errorTitle}</h1>
      <p className="text-pretty text-muted-foreground">{en.errorBody}</p>
      {error.digest !== undefined && (
        <p className="font-mono text-xs text-muted-foreground">
          {en.errorDigest} <span className="select-all">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-col gap-2 self-stretch sm:flex-row sm:justify-center sm:self-auto">
        <Button onClick={reset}>{en.errorRetry}</Button>
      </div>
    </main>
  );
}
