import Link from 'next/link';
import { en } from '@/i18n/en';

/**
 * Shared by `/` and `/docs` only. The wizard deliberately has no footer — it is
 * a focused, desktop-only workflow, and chrome that invites you to navigate away
 * mid-configuration would work against that.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-tight">{en.appName}</p>
          <p className="text-sm text-muted-foreground">{en.footerTagline}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link href="/docs" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {en.footerDocs}
          </Link>
          <a
            href={en.footerRepoUrl}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {en.footerGithub}
          </a>
          <a
            href={`${en.footerRepoUrl}/blob/main/docs/TECHNICAL-PLAN.md`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {en.footerTechnicalPlan}
          </a>
          <a
            href={`${en.footerRepoUrl}/blob/main/LICENSE`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {en.footerLicense}
          </a>
        </nav>
      </div>
    </footer>
  );
}
