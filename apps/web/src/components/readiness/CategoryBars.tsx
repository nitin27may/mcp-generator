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
        <li key={c.category} className="flex items-center gap-3">
          <span className="w-44 shrink-0 text-sm">{CATEGORY_LABELS[c.category]}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${CATEGORY_LABELS[c.category]}: ${c.score} out of 100, weight ${c.weight}%`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${c.score}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{c.score}</span>
          <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">weight {c.weight}%</span>
        </li>
      ))}
    </ul>
  );
}
