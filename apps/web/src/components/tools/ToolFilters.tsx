import type { RiskClassification } from '@mcpgen/risk-engine';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { en } from '@/i18n/en';

export type EnabledFilter = 'all' | 'enabled' | 'disabled';
export type RiskFilter = RiskClassification | 'all';

const RISK_OPTIONS: readonly RiskFilter[] = ['all', 'READ_ONLY', 'WRITE', 'DESTRUCTIVE', 'PRIVILEGED', 'UNKNOWN'];
const RISK_OPTION_LABELS: Record<RiskFilter, string> = {
  all: en.toolsFilterRiskAll,
  READ_ONLY: en.riskReadOnly,
  WRITE: en.riskWrite,
  DESTRUCTIVE: en.riskDestructive,
  PRIVILEGED: en.riskPrivileged,
  UNKNOWN: en.riskUnknown,
};

export function ToolFilters({
  search,
  onSearchChange,
  riskFilter,
  onRiskFilterChange,
  enabledFilter,
  onEnabledFilterChange,
  onEnableAllShown,
  onDisableAllShown,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  riskFilter: RiskFilter;
  onRiskFilterChange: (value: RiskFilter) => void;
  enabledFilter: EnabledFilter;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onEnableAllShown: () => void;
  onDisableAllShown: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={en.toolsSearchPlaceholder}
        aria-label={en.toolsSearchPlaceholder}
        className="max-w-xs"
      />

      <Select value={riskFilter} onValueChange={(value) => value !== null && onRiskFilterChange(value as RiskFilter)}>
        <SelectTrigger aria-label={en.toolsFilterRiskLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RISK_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {RISK_OPTION_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={enabledFilter} onValueChange={(value) => value !== null && onEnabledFilterChange(value as EnabledFilter)}>
        <SelectTrigger aria-label={en.toolsFilterEnabledLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{en.toolsFilterEnabledAll}</SelectItem>
          <SelectItem value="enabled">{en.toolsFilterEnabledOnly}</SelectItem>
          <SelectItem value="disabled">{en.toolsFilterDisabledOnly}</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={onEnableAllShown}>
          {en.toolsEnableAllShown}
        </Button>
        <Button variant="outline" size="sm" onClick={onDisableAllShown}>
          {en.toolsDisableAllShown}
        </Button>
      </div>
    </div>
  );
}
