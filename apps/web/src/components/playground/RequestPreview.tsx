import type { DryRunResult } from '@mcpgen/control-contracts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { en } from '@/i18n/en';

function fullUrl(result: DryRunResult): string {
  const query = result.request.query.length > 0 ? `?${result.request.query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `${result.baseUrl ?? ''}${result.request.path}${query}`;
}

/** Read-only. `request.headers` already passed through `redactHeaders` server-side — nothing further to scrub here. */
export function RequestPreview({ result }: { result: DryRunResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
        <span className="font-semibold">{result.request.method}</span> {fullUrl(result)}
      </div>

      {Object.keys(result.request.headers).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{en.playgroundHeadersHeading}</p>
          <div className="flex flex-col gap-0.5 font-mono text-xs">
            {Object.entries(result.request.headers).map(([name, value]) => (
              <div key={name}>
                {name}: {value}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.request.body !== undefined && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{en.playgroundBodyHeading}</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(result.request.body, null, 2)}</pre>
        </div>
      )}

      {result.unresolvedVariables.length > 0 && (
        <Alert>
          <AlertTitle>{en.playgroundUnresolvedHeading}</AlertTitle>
          <AlertDescription>
            <p>{en.playgroundUnresolvedBody}</p>
            <ul className="mt-1 list-disc pl-4 font-mono text-xs">
              {result.unresolvedVariables.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
