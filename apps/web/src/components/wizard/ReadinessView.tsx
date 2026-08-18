'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScoreDial } from '@/components/readiness/ScoreDial';
import { CategoryBars } from '@/components/readiness/CategoryBars';
import { FindingList } from '@/components/readiness/FindingList';
import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useProjectQuery } from '@/api-client/queries';
import { useAnalyzeMutation } from '@/api-client/mutations';
import { ApiRequestError } from '@/api-client/client';
import { en } from '@/i18n/en';

export function ReadinessView({ projectId }: { projectId: string }) {
  const projectQuery = useProjectQuery(projectId, ['analysis']);
  const analyzeMutation = useAnalyzeMutation(projectId);

  const analysis = projectQuery.data?.analysis;
  const errors = analyzeMutation.error instanceof ApiRequestError ? analyzeMutation.error.errors : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{en.readinessCategoryScoresHeading}</CardTitle>
          <Button
            variant={analysis ? 'outline' : 'default'}
            disabled={analyzeMutation.isPending || projectQuery.isLoading}
            onClick={() => analyzeMutation.mutate(analysis ? { force: true } : {})}
          >
            {analyzeMutation.isPending ? en.readinessRunning : analysis ? en.readinessReanalyze : en.readinessRunAnalysis}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ProductErrorPanel errors={errors} />
          {analysis ? (
            <>
              <ScoreDial score={analysis.readiness.overallScore} />
              <CategoryBars categoryScores={analysis.readiness.categoryScores} />
            </>
          ) : (
            !analyzeMutation.isPending && !projectQuery.isLoading && <p className="text-sm text-muted-foreground">{en.readinessSubtitle}</p>
          )}
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle>
              {en.readinessFindingsHeading} — {en.readinessFindingCount(analysis.readiness.findings.length)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FindingList findings={analysis.readiness.findings} />
          </CardContent>
        </Card>
      )}

      <StepFooter
        backHref={`/projects/${projectId}/validation`}
        continueHref={`/projects/${projectId}/api`}
        continueLabel={en.readinessContinue}
      />
    </div>
  );
}
