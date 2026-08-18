import type { Metadata } from 'next';
import Link from 'next/link';
import { WIZARD_STEPS, isStepOptional, type WizardStepId } from '@mcpgen/control-contracts';
import { buttonVariants } from '@/components/ui/button';
import { CodeBlock } from '@/components/marketing/CodeBlock';
import { ScreenshotFrame } from '@/components/marketing/ScreenshotFrame';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { en } from '@/i18n/en';

export const metadata: Metadata = {
  title: en.docsMetaTitle,
  description: en.docsMetaDescription,
  openGraph: {
    type: 'article',
    title: en.docsMetaTitle,
    description: en.docsMetaDescription,
  },
};

const INSTALL_SNIPPET = `git clone ${en.footerRepoUrl}.git
cd mcp-generator
pnpm install
pnpm build

cd apps/cli && npm link`;

const USE_SNIPPET = `mcpgen validate --spec ./openapi.json
mcpgen generate --config ./mcp.config.json --spec ./openapi.json --out ./server
mcpgen serve --config ./mcp.config.json --spec ./openapi.json`;

/**
 * This page has no project open, so `isStepOptional`'s auth branch has nothing
 * to resolve against. Rendering a bare "Optional" next to Authentication here
 * would make exactly the claim Phase 6 exists to prevent — an API that needs
 * credentials is not one whose auth step you can skip — so auth gets the
 * qualified marker instead of the flat one.
 */
function optionalMarkerFor(stepId: WizardStepId): string | undefined {
  if (stepId === 'auth') return en.docsStepOptionalWhenUnauthenticated;
  return isStepOptional(stepId, { hasUpstreamAuth: true }) ? en.stepOptional : undefined;
}

export default function DocsPage() {
  return (
    <>
      <main id="main-content" className="mx-auto flex max-w-3xl flex-col gap-14 px-6 py-12 sm:py-16">
        <header className="flex flex-col gap-4">
          <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            {en.docsHeadline}
          </h1>
          <p className="text-base text-muted-foreground text-pretty sm:text-lg">{en.docsSubheadline}</p>
        </header>

        <section className="flex flex-col gap-5">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.docsWizardHeading}</h2>
          <p className="text-muted-foreground text-pretty">{en.docsWizardBody}</p>
          <ol className="flex flex-col gap-1 text-sm">
            {WIZARD_STEPS.map((step) => (
              <li key={step.id} className="flex items-baseline gap-3 border-b py-2 last:border-b-0">
                <span aria-hidden="true" className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {step.order + 1}
                </span>
                <span className="flex-1 font-medium">{step.label}</span>
                {optionalMarkerFor(step.id) !== undefined && (
                  <span className="text-right text-xs text-muted-foreground">{optionalMarkerFor(step.id)}</span>
                )}
              </li>
            ))}
          </ol>
          <ScreenshotFrame
            src="/hero-tools.png"
            alt={en.docsWizardImageAlt}
            caption={en.docsWizardImageCaption}
            width={2560}
            height={940}
          />
          <Link href="/projects/new/import" className={buttonVariants({ variant: 'default', className: 'self-start' })}>
            {en.docsWizardCta}
          </Link>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.docsCliHeading}</h2>
          <p className="text-muted-foreground text-pretty">{en.docsCliBody}</p>
          <CodeBlock caption={en.docsCliInstallCaption} code={INSTALL_SNIPPET} />
          <CodeBlock caption={en.docsCliUseCaption} code={USE_SNIPPET} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.docsGeneratedHeading}</h2>
          <p className="text-muted-foreground text-pretty">{en.docsGeneratedBody}</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.docsEnvHeading}</h2>
          <p className="text-muted-foreground text-pretty">
            {en.docsEnvBody}{' '}
            <a
              href={`${en.footerRepoUrl}/blob/main/apps/web/src/server/env.ts`}
              className="text-primary underline underline-offset-4"
            >
              {en.docsEnvLinkLabel}
            </a>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
