'use client';

import { useState } from 'react';
import type { Diagnostic } from '@mcpgen/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiagnosticList } from '@/components/diagnostics/DiagnosticList';
import { SourceEditor } from '@/components/editor/SourceEditor';
import { StepFooter } from '@/components/wizard/StepFooter';
import { resolveSourcePointerLine } from '@/lib/source-pointer';
import { en } from '@/i18n/en';

export function ValidationView({
  projectId,
  diagnostics,
  rawSource,
  format,
}: {
  projectId: string;
  diagnostics: readonly Diagnostic[];
  rawSource: string;
  format: 'json' | 'yaml';
}) {
  const [highlightLine, setHighlightLine] = useState<number | undefined>(undefined);
  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{en.validationTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <DiagnosticList
            diagnostics={diagnostics}
            onSourcePointerSelect={(pointer) => setHighlightLine(resolveSourcePointerLine(rawSource, pointer))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{en.validationSourceHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <SourceEditor value={rawSource} language={format} highlightLine={highlightLine} ariaLabel={en.validationSourceHeading} />
        </CardContent>
      </Card>

      <StepFooter
        backHref={`/projects/new/import`}
        continueHref={`/projects/${projectId}/readiness`}
        continueDisabled={hasErrors}
        continueLabel={en.validationContinue}
      />
    </div>
  );
}
