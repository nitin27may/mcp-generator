import { cn } from '@/lib/utils';
import { en } from '@/i18n/en';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function bandFor(score: number): { label: string; className: string } {
  if (score >= 80) return { label: 'Strong', className: 'text-success' };
  if (score >= 50) return { label: 'Needs work', className: 'text-amber-600 dark:text-amber-500' };
  return { label: 'Not ready', className: 'text-destructive' };
}

/**
 * The score is always rendered as text alongside the dial (WCAG
 * never-color/shape-alone) — the SVG arc is a supplementary visual, not the
 * only carrier of the information.
 */
export function ScoreDial({ score }: { score: number }) {
  const band = bandFor(score);
  const offset = CIRCUMFERENCE * (1 - score / 100);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0" role="img" aria-label={en.readinessOutOf(score)}>
        <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className={cn('stroke-current transition-[stroke-dashoffset]', band.className)}
        />
        <text x="60" y="66" textAnchor="middle" className="fill-foreground text-2xl font-medium" style={{ font: '600 28px inherit' }}>
          {score}
        </text>
      </svg>
      <div>
        <p className="text-sm font-medium">{en.readinessOverallScoreLabel}</p>
        <p className={cn('text-sm', band.className)}>
          {band.label} — {en.readinessOutOf(score)}
        </p>
      </div>
    </div>
  );
}
