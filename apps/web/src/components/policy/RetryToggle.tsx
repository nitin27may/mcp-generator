import type { RetryConfig, ToolRisk } from '@mcpgen/config-schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { en } from '@/i18n/en';

type RetryChoice = 'default' | 'always' | 'never';

function choiceOf(retry: RetryConfig | undefined): RetryChoice {
  if (retry === undefined) return 'default';
  return retry.enabled ? 'always' : 'never';
}

function retryConfigOf(choice: RetryChoice): RetryConfig | undefined {
  switch (choice) {
    case 'default':
      return undefined;
    case 'always':
      return { enabled: true };
    case 'never':
      return { enabled: false };
  }
}

/**
 * BR-006 / ADR-0008: `DESTRUCTIVE`/`PRIVILEGED` risk is a hard floor the
 * runtime's `isRetryEligible` enforces regardless of `ToolConfig.retry` —
 * disabled here rather than hidden, with copy explaining *why*, so the UI
 * never implies this control has an effect it structurally can't have.
 */
export function RetryToggle({
  value,
  risk,
  onChange,
  idPrefix,
}: {
  value: RetryConfig | undefined;
  risk: ToolRisk;
  onChange: (next: RetryConfig | undefined) => void;
  idPrefix: string;
}) {
  const forcedOff = risk === 'DESTRUCTIVE' || risk === 'PRIVILEGED';

  if (forcedOff) {
    return <p className="text-xs text-muted-foreground">{en.retryForcedOff}</p>;
  }

  return (
    <Select value={choiceOf(value)} onValueChange={(choice) => choice !== null && onChange(retryConfigOf(choice as RetryChoice))}>
      <SelectTrigger id={`${idPrefix}-retry`} aria-label={en.policyColumnRetry}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">{en.retryDefault}</SelectItem>
        <SelectItem value="always">{en.retryAlways}</SelectItem>
        <SelectItem value="never">{en.retryNever}</SelectItem>
      </SelectContent>
    </Select>
  );
}
