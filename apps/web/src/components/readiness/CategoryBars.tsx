import type { CategoryScore, ReadinessCategory } from '@mcpgen/readiness-engine';
import { en } from '@/i18n/en';

const CATEGORY_LABELS: Record<ReadinessCategory, string> = {
  discoverability: en.readinessCategoryDiscoverability,
  'semantic-clarity': en.readinessCategorySemanticClarity,
  'schema-usability': en.readinessCategorySchemaUsability,
  'tool-set-quality': en.readinessCategoryToolSetQuality,
  safety: en.readinessCategorySafety,
  'authentication-readiness': en.readinessCategoryAuthenticationReadiness,
  'runtime-completeness': en.readinessCategoryRuntimeCompleteness,
  'response-quality': en.readinessCategoryResponseQuality,
};

export function CategoryBars({ categoryScores }: { categoryScores: readonly CategoryScore[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {categoryScores.map((c) => (
        /* Label above the bar below `sm`, beside it above. The row previously reserved
           176 + 48 + 80 = 304px of shrink-0 chrome before the bar got any width at all,
           which collapsed the bar entirely inside a narrow column. */
        <li key={c.category} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-sm sm:w-44 sm:shrink-0">{CATEGORY_LABELS[c.category]}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${CATEGORY_LABELS[c.category]}: ${c.score} out of 100, weight ${c.weight}%`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${c.score}%` }} />
          </div>
          <span className="w-12 shrink-0 text-sm tabular-nums text-muted-foreground sm:text-right">{c.score}</span>
          <span className="shrink-0 text-xs text-muted-foreground sm:w-20 sm:text-right">weight {c.weight}%</span>
        </li>
      ))}
    </ul>
  );
}
