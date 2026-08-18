import Link from 'next/link';
import { en } from '@/i18n/en';

/**
 * The one piece of persistent chrome across the whole app — without it,
 * every step past import has no visible app identity and (via `StepShell`'s
 * project-name line) no on-screen indication of which project is open.
 */
export function AppHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
        {/* The wordmark points at `/` now that `/` is a real page rather than a
            two-line placeholder — a header logo that skips the landing page and
            drops you straight into an import form is a trap on a public site. */}
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            M
          </span>
          mcpgen
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/docs" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {en.footerDocs}
          </Link>
          <a href={en.footerRepoUrl} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {en.footerGithub}
          </a>
        </nav>
      </div>
    </header>
  );
}
