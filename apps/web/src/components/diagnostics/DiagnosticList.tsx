import type { Diagnostic } from '@mcpgen/domain';
import { compareDiagnosticSeverity } from '@mcpgen/domain';
import { Card, CardContent } from '@/components/ui/card';
import { en } from '@/i18n/en';
import { SeverityBadge } from './SeverityBadge';

export function DiagnosticList({
  diagnostics,
  onSourcePointerSelect,
}: {
  diagnostics: readonly Diagnostic[];
  onSourcePointerSelect?: (sourcePointer: string) => void;
}) {
  if (diagnostics.length === 0) {
    return <p className="text-sm text-muted-foreground">{en.validationNoDiagnostics}</p>;
  }

  const sorted = [...diagnostics].sort(compareDiagnosticSeverity);

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${index}`}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={diagnostic.severity} />
                <span className="font-mono text-xs text-muted-foreground">{diagnostic.code}</span>
              </div>
              <p className="text-sm">{diagnostic.message}</p>
              {diagnostic.sourcePointer !== undefined && (
                <button
                  type="button"
                  className="w-fit text-left text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => onSourcePointerSelect?.(diagnostic.sourcePointer as string)}
                >
                  {diagnostic.sourcePointer}
                </button>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
