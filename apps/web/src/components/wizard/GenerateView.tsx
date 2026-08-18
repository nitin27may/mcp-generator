'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileManifest } from '@/components/generate/FileManifest';
import { DownloadButton } from '@/components/generate/DownloadButton';
import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { ConflictBanner } from '@/components/wizard/ConflictBanner';
import { StepFooter } from '@/components/wizard/StepFooter';
import { useGenerateMutation } from '@/api-client/mutations';
import { ApiRequestError } from '@/api-client/client';
import { useWizardState } from '@/wizard/useWizard';
import { en } from '@/i18n/en';

export function GenerateView({ projectId }: { projectId: string }) {
  const { snapshot } = useWizardState();
  const generateMutation = useGenerateMutation(projectId);
  const errors = generateMutation.error instanceof ApiRequestError ? generateMutation.error.errors : [];

  const gate = snapshot?.gates.generate;
  const blocked = gate !== undefined && !gate.reachable;

  return (
    <div className="flex flex-col gap-4">
      <ConflictBanner projectId={projectId} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {blocked && gate.blockedBy && (
            <Alert variant="destructive">
              <AlertDescription>{gate.blockedBy}</AlertDescription>
            </Alert>
          )}

          <Button className="w-fit" disabled={blocked || generateMutation.isPending} onClick={() => generateMutation.mutate({})}>
            {generateMutation.isPending ? en.generateRunning : en.generateSubmit}
          </Button>
          {generateMutation.isSuccess && <p className="text-xs text-muted-foreground">{en.generateRegenerateNote}</p>}

          <ProductErrorPanel errors={errors} />

          {generateMutation.data ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{en.generateManifestHeading}</h3>
                <span className="text-xs text-muted-foreground">{en.generateTotalSize(generateMutation.data.totalBytes)}</span>
              </div>
              <FileManifest files={generateMutation.data.files} />
              <DownloadButton downloadUrl={generateMutation.data.downloadUrl} />
            </div>
          ) : (
            !generateMutation.isPending && <p className="text-sm text-muted-foreground">{en.generateNoResultYet}</p>
          )}
        </CardContent>
      </Card>

      <StepFooter backHref={`/projects/${projectId}/playground`} />
    </div>
  );
}
