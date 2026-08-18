import Link from 'next/link';

/**
 * The one piece of persistent chrome across the whole app — without it,
 * every step past import has no visible app identity and (via `StepShell`'s
 * project-name line) no on-screen indication of which project is open.
 */
export function AppHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3">
        <Link href="/projects/new/import" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            M
          </span>
          mcpgen
        </Link>
      </div>
    </header>
  );
}
