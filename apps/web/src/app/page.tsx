import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { en } from '@/i18n/en';

export default function HomePage() {
  return (
    <main id="main-content" className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="font-heading text-2xl font-medium">{en.appName}</h1>
      <p className="text-muted-foreground">{en.appTagline}</p>
      <Link href="/projects/new/import" className={buttonVariants({ variant: 'default' })}>
        Import an OpenAPI document
      </Link>
    </main>
  );
}
