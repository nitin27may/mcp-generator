import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileJson, Gauge, KeyRound, ShieldAlert } from 'lucide-react';
import { WIZARD_STEPS, type WizardStepId } from '@mcpgen/control-contracts';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScreenshotFrame } from '@/components/marketing/ScreenshotFrame';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { en } from '@/i18n/en';

/**
 * `/` is the one route a stranger can reach cold — from a shared link, a
 * tools-listing site, or the README — so it gets its own metadata rather than
 * inheriting the app shell's generic title, and it is the only route in this
 * app built mobile-first. The wizard behind it is deliberately desktop-only
 * (curating a tool surface means reading operation tables beside their
 * schemas); a public page cannot make that assumption about where it is opened.
 */
export const metadata: Metadata = {
  title: en.landingMetaTitle,
  description: en.landingMetaDescription,
  openGraph: {
    type: 'website',
    title: en.landingMetaTitle,
    description: en.landingMetaDescription,
    images: [{ url: '/hero-readiness.png', width: 2560, height: 1600, alt: en.landingHeroImageAlt }],
  },
  twitter: {
    card: 'summary_large_image',
    title: en.landingMetaTitle,
    description: en.landingMetaDescription,
    images: ['/hero-readiness.png'],
  },
};

const FEATURES = [
  { icon: Gauge, title: en.landingFeatureReadinessTitle, body: en.landingFeatureReadinessBody },
  { icon: ShieldAlert, title: en.landingFeatureRiskTitle, body: en.landingFeatureRiskBody },
  { icon: KeyRound, title: en.landingFeatureSecretsTitle, body: en.landingFeatureSecretsBody },
  { icon: FileJson, title: en.landingFeatureManifestTitle, body: en.landingFeatureManifestBody },
] as const;

/**
 * Labels come from `WIZARD_STEPS` rather than being retyped here, so renaming a
 * step in the product cannot leave the landing page describing an older one.
 */
const HOW_IT_WORKS: readonly { id: WizardStepId; body: string }[] = [
  { id: 'import', body: en.landingHowImportBody },
  { id: 'readiness', body: en.landingHowReadinessBody },
  { id: 'tools', body: en.landingHowToolsBody },
  { id: 'generate', body: en.landingHowGenerateBody },
];

const FAQ = [
  { question: en.landingFaqConverterQ, answer: en.landingFaqConverterA },
  { question: en.landingFaqSourceQ, answer: en.landingFaqSourceA },
  { question: en.landingFaqDataQ, answer: en.landingFaqDataA },
  { question: en.landingFaqMobileQ, answer: en.landingFaqMobileA },
] as const;

function labelFor(id: WizardStepId): string {
  return WIZARD_STEPS.find((step) => step.id === id)?.label ?? id;
}

export default function HomePage() {
  return (
    <>
      <main id="main-content" className="mx-auto flex max-w-5xl flex-col gap-20 px-6 py-12 sm:py-16">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col items-start gap-5">
            <p className="rounded-4xl bg-card px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10">{en.landingEyebrow}</p>
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
              {en.landingHeadline}
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground text-pretty sm:text-lg">{en.landingSubheadline}</p>
            <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
              <Link href="/projects/new/import" className={buttonVariants({ variant: 'default' })}>
                {en.landingPrimaryCta}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/docs" className={buttonVariants({ variant: 'outline' })}>
                {en.landingSecondaryCta}
              </Link>
            </div>
          </div>
          <ScreenshotFrame
            src="/hero-readiness.png"
            alt={en.landingHeroImageAlt}
            caption={en.landingHeroCaption}
            width={2560}
            height={1600}
            priority
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.landingWhyHeading}</h2>
          <p className="max-w-3xl text-muted-foreground text-pretty">{en.landingWhyBody}</p>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.landingFeaturesHeading}</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <Card className="h-full">
                  <CardHeader className="gap-2">
                    <feature.icon aria-hidden="true" className="size-5 text-primary" />
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription className="text-pretty">{feature.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-2xl font-medium tracking-tight">{en.landingHowHeading}</h2>
            <p className="max-w-2xl text-muted-foreground text-pretty">{en.landingHowSubheading}</p>
          </div>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.id} className="flex flex-col gap-1.5 border-t pt-4">
                <span aria-hidden="true" className="text-xs font-semibold tabular-nums text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="font-heading text-base font-medium">{labelFor(step.id)}</h3>
                <p className="text-sm text-muted-foreground text-pretty">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col items-start gap-4 rounded-xl bg-card px-6 py-8 ring-1 ring-foreground/10 sm:px-8">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.landingClosingHeading}</h2>
          <p className="max-w-2xl text-muted-foreground text-pretty">{en.landingClosingBody}</p>
          <div className="flex flex-col gap-3 self-stretch sm:flex-row sm:self-auto">
            <Link href="/projects/new/import" className={buttonVariants({ variant: 'default' })}>
              {en.landingPrimaryCta}
            </Link>
            <Link href="/docs" className={buttonVariants({ variant: 'outline' })}>
              {en.landingSecondaryCta}
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl font-medium tracking-tight">{en.landingFaqHeading}</h2>
          <dl className="grid gap-6 sm:grid-cols-2">
            {FAQ.map((entry) => (
              <div key={entry.question} className="flex flex-col gap-1.5">
                <dt className="font-medium">{entry.question}</dt>
                <dd className="text-sm text-muted-foreground text-pretty">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
