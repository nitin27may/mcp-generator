import type { DiagnosticSeverity } from '@mcpgen/domain';
import { AlertCircle, AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { en } from '@/i18n/en';

const SEVERITY_META: Record<DiagnosticSeverity, { label: string; variant: 'destructive' | 'default' | 'secondary' | 'outline'; Icon: typeof Info }> = {
  error: { label: en.severityError, variant: 'destructive', Icon: AlertCircle },
  warning: { label: en.severityWarning, variant: 'default', Icon: AlertTriangle },
  recommendation: { label: en.severityRecommendation, variant: 'secondary', Icon: Lightbulb },
  info: { label: en.severityInfo, variant: 'outline', Icon: Info },
};

/** WCAG never-color-alone: severity is always conveyed by icon + text, never by color alone. */
export function SeverityBadge({ severity }: { severity: DiagnosticSeverity }) {
  const { label, variant, Icon } = SEVERITY_META[severity];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
