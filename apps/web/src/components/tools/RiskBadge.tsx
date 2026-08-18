import type { RiskClassification } from '@mcpgen/risk-engine';
import { Ban, Eye, Pencil, ShieldAlert, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { en } from '@/i18n/en';

const RISK_META: Record<RiskClassification, { label: string; variant: 'outline' | 'secondary' | 'destructive' | 'default'; Icon: typeof Eye }> = {
  READ_ONLY: { label: en.riskReadOnly, variant: 'outline', Icon: Eye },
  WRITE: { label: en.riskWrite, variant: 'secondary', Icon: Pencil },
  DESTRUCTIVE: { label: en.riskDestructive, variant: 'destructive', Icon: Ban },
  PRIVILEGED: { label: en.riskPrivileged, variant: 'destructive', Icon: ShieldAlert },
  UNKNOWN: { label: en.riskUnknown, variant: 'secondary', Icon: HelpCircle },
};

/** WCAG never-color-alone: risk is always icon + text. `reasons` (from `RiskAssessment`) is available as a title tooltip for anyone who wants the "why". */
export function RiskBadge({ classification, reasons }: { classification: RiskClassification; reasons?: readonly string[] }) {
  const { label, variant, Icon } = RISK_META[classification];
  return (
    <Badge variant={variant} title={reasons?.join(' ')}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
