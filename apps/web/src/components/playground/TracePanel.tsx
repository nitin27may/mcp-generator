import type { ExecutionTrace } from '@mcpgen/control-contracts';
import { AlertOctagon, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { en } from '@/i18n/en';

const RESULT_META: Record<ExecutionTrace['resultType'], { label: string; variant: 'default' | 'destructive' | 'secondary'; Icon: typeof CheckCircle2 }> = {
  success: { label: en.traceResultSuccess, variant: 'default', Icon: CheckCircle2 },
  'upstream-error': { label: en.traceResultUpstreamError, variant: 'destructive', Icon: XCircle },
  'validation-error': { label: en.traceResultValidationError, variant: 'secondary', Icon: AlertOctagon },
};

/** Read-only. Every field here was already redacted server-side (`redactValue`/`redactHeaders`) before this trace ever left the process — nothing further to scrub. */
export function TracePanel({ trace }: { trace: ExecutionTrace }) {
  const { label, variant, Icon } = RESULT_META[trace.resultType];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={variant}>
          <Icon aria-hidden="true" />
          {label}
        </Badge>
        {trace.upstreamStatus !== undefined && <span className="font-mono text-xs text-muted-foreground">HTTP {trace.upstreamStatus}</span>}
        <span className="text-xs text-muted-foreground">{en.traceDuration(trace.durationMs)}</span>
      </div>

      {trace.resolvedRequest && (
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
            <span className="font-semibold">{trace.resolvedRequest.method}</span> {trace.resolvedRequest.url}
          </div>
          {Object.keys(trace.resolvedRequest.headers).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{en.playgroundHeadersHeading}</p>
              <div className="flex flex-col gap-0.5 font-mono text-xs">
                {Object.entries(trace.resolvedRequest.headers).map(([name, value]) => (
                  <div key={name}>
                    {name}: {value}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{en.traceResponseHeading}</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(trace.response, null, 2)}</pre>
      </div>
    </div>
  );
}
