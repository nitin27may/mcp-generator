import type { OperationDetail } from '@mcpgen/control-contracts';
import { DiagnosticList } from '@/components/diagnostics/DiagnosticList';
import { en } from '@/i18n/en';

/** Read-only. No editor affordance — the Tool Designer edits name/description/enabled only (no schema editing in this build). */
export function SchemaPreview({ detail, isLoading }: { detail: OperationDetail | undefined; isLoading: boolean }) {
  if (isLoading) return <p className="text-sm text-muted-foreground">{en.toolDesignerSchemaLoading}</p>;
  if (!detail) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {detail.parameters.map((param) => (
          <div key={param.id} className="flex items-center gap-2 text-xs">
            <span className="font-mono">{param.sourceName}</span>
            <span className="text-muted-foreground">({param.location}{param.required ? ', required' : ''})</span>
            <span className="text-muted-foreground">{typeof param.schema['type'] === 'string' ? String(param.schema['type']) : 'object'}</span>
          </div>
        ))}
        {detail.requestBody && (
          <div className="mt-1 flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-foreground">Request body ({detail.requestBody.contentType}{detail.requestBody.required ? ', required' : ''})</span>
            {detail.requestBody.properties.map((prop) => (
              <span key={prop} className="font-mono">
                {prop}
                {detail.requestBody!.requiredProperties.includes(prop) ? '*' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{detail.schemaBudget.withinBudget ? en.toolDesignerSchemaBudgetOk : ''}</p>
      {!detail.schemaBudget.withinBudget && <DiagnosticList diagnostics={detail.schemaBudget.violations} />}
      {detail.headerAnnotations.length > 0 && <DiagnosticList diagnostics={detail.headerAnnotations} />}
    </div>
  );
}
