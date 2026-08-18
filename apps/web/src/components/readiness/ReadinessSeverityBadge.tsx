import type { ReadinessSeverity } from '@mcpgen/readiness-engine';
import { AlertOctagon, AlertTriangle, Flame, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { en } from '@/i18n/en';

const SEVERITY_META: Record<ReadinessSeverity, { label: string; variant: 'destructive' | 'default' | 'secondary' | 'outline'; Icon: typeof Info }> = {
  info: { label: en.readinessSeverityInfo, variant: 'outline', Icon: Info },
  warning: { label: en.readinessSeverityWarning, variant: 'secondary', Icon: AlertTriangle },
  high: { label: en.readinessSeverityHigh, variant: 'default', Icon: Flame },
  critical: { label: en.readinessSeverityCritical, variant: 'destructive', Icon: AlertOctagon },
};

/** WCAG never-color-alone: severity is always icon + text. */
export function ReadinessSeverityBadge({ severity }: { severity: ReadinessSeverity }) {
  const { label, variant, Icon } = SEVERITY_META[severity];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
