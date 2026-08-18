import type { ReadinessFinding, ReadinessSeverity } from '@mcpgen/readiness-engine';
import { Card, CardContent } from '@/components/ui/card';
import { en } from '@/i18n/en';
import { ReadinessSeverityBadge } from './ReadinessSeverityBadge';

const SEVERITY_ORDER: readonly ReadinessSeverity[] = ['critical', 'high', 'warning', 'info'];

export function FindingList({ findings }: { findings: readonly ReadinessFinding[] }) {
  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">{en.readinessNoFindings}</p>;
  }

  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((finding, index) => (
        <li key={`${finding.ruleId}-${index}`}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <ReadinessSeverityBadge severity={finding.severity} />
                <span className="text-sm font-medium">{finding.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{finding.explanation}</p>
              {finding.remediation !== undefined && <p className="text-sm">{finding.remediation}</p>}
              {finding.operationId !== undefined && <p className="font-mono text-xs text-muted-foreground">{finding.operationId}</p>}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
