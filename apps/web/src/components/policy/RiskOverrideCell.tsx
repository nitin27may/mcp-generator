import type { ToolRisk } from '@mcpgen/config-schema';
import type { RiskAssessment } from '@mcpgen/risk-engine';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { en } from '@/i18n/en';

const RISK_LABELS: Record<ToolRisk, string> = {
  READ_ONLY: en.riskReadOnly,
  WRITE: en.riskWrite,
  DESTRUCTIVE: en.riskDestructive,
  PRIVILEGED: en.riskPrivileged,
  UNKNOWN: en.riskUnknown,
};
const RISK_OPTIONS: readonly ToolRisk[] = ['READ_ONLY', 'WRITE', 'DESTRUCTIVE', 'PRIVILEGED', 'UNKNOWN'];

/** The select always shows the *configured* risk (`ToolConfig.risk`) — the original suggestion + its reasons render alongside as context, not as the value itself, since overriding it is the whole point of this control. */
export function RiskOverrideCell({
  value,
  suggested,
  onChange,
  idPrefix,
}: {
  value: ToolRisk;
  suggested?: RiskAssessment | undefined;
  onChange: (next: ToolRisk) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Select value={value} onValueChange={(next) => next !== null && onChange(next as ToolRisk)}>
        <SelectTrigger id={`${idPrefix}-risk`} aria-label={en.policyColumnRisk}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RISK_OPTIONS.map((risk) => (
            <SelectItem key={risk} value={risk}>
              {RISK_LABELS[risk]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {suggested && suggested.classification !== value && (
        <p className="text-xs text-muted-foreground" title={suggested.reasons.join(' ')}>
          {en.policySuggestedRisk(RISK_LABELS[suggested.classification])}
        </p>
      )}
    </div>
  );
}
