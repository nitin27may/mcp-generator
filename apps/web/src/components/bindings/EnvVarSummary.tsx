import type { EnvVarSummaryEntry } from '@mcpgen/control-contracts';
import { Badge } from '@/components/ui/badge';
import { en } from '@/i18n/en';

function usedByLabel(entry: EnvVarSummaryEntry): string {
  const parts: string[] = [];
  if (entry.usedByBaseUrl) parts.push(en.envSummaryUsedByBaseUrl);
  if (entry.usedByMcpAccess) parts.push(en.envSummaryUsedByMcpAccess);
  if (entry.usedByAuth) parts.push(en.envSummaryUsedByAuth);
  if (entry.usedByToolCount > 0) parts.push(en.envSummaryUsedByCount(entry.usedByToolCount));
  return parts.join(', ');
}

/** BRD §16's "configuration preview" — read-only, derived entirely from `buildEnvVarSummary(configDraft)`. */
export function EnvVarSummary({ entries }: { entries: readonly EnvVarSummaryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{en.envSummaryEmpty}</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="py-2 pr-2 font-medium">{en.envSummaryColumnName}</th>
          <th className="py-2 pr-2 font-medium">{en.envSummaryColumnRequired}</th>
          <th className="py-2 pr-2 font-medium">{en.envSummaryColumnSensitive}</th>
          <th className="py-2 pr-2 font-medium">{en.envSummaryColumnUsedBy}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.name} className="border-b last:border-0">
            <td className="py-2 pr-2 font-mono text-xs">{entry.name}</td>
            <td className="py-2 pr-2">{entry.required ? 'Yes' : 'No'}</td>
            <td className="py-2 pr-2">{entry.sensitive && <Badge variant="destructive">Sensitive</Badge>}</td>
            <td className="py-2 pr-2 text-xs text-muted-foreground">{usedByLabel(entry)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
