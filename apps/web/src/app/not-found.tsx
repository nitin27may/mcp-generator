import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { en } from '@/i18n/en';

/**
 * Reached by `notFound()` in the project routes — an unknown or expired project id — as
 * well as by any unmatched URL. Until now both fell through to Next's stock 404, which
 * says nothing about the most likely cause here: projects are stored on disk with a TTL
 * and are swept after a week.
 */
export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
      <FileQuestion aria-hidden="true" className="size-10 text-muted-foreground" />
      <h1 className="font-heading text-2xl font-medium tracking-tight text-balance">{en.notFoundTitle}</h1>
      <p className="text-pretty text-muted-foreground">{en.notFoundBody}</p>
      <div className="flex flex-col gap-2 self-stretch sm:flex-row sm:justify-center sm:self-auto">
        <Link href="/projects/new/import" className={buttonVariants({ variant: 'default' })}>
          {en.notFoundStartOver}
        </Link>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          {en.notFoundHome}
        </Link>
      </div>
    </main>
  );
}
