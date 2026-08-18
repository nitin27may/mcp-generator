'use client';

import { useState } from 'react';
import type { ToolConfig } from '@mcpgen/config-schema';
import { Button } from '@/components/ui/button';
import { ToolInputForm } from './ToolInputForm';
import { RequestPreview } from './RequestPreview';
import { DiagnosticList } from '@/components/diagnostics/DiagnosticList';
import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { useDryRunMutation } from '@/api-client/mutations';
import { ApiRequestError } from '@/api-client/client';
import { en } from '@/i18n/en';

/** JSON-parse each raw field, falling back to the literal string when it doesn't parse (covers numbers/booleans/objects typed as JSON, while plain text stays plain text). Empty fields are omitted — an agent simply wouldn't supply them. */
function coerceInputs(raw: Readonly<Record<string, string>>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === '') continue;
    try {
      input[name] = JSON.parse(value);
    } catch {
      input[name] = value;
    }
  }
  return input;
}

/**
 * Mounted with `key={tool.name}` by its caller — switching tools remounts
 * this component fresh, which is what actually resets `rawValues` and the
 * dry-run mutation state (an effect that calls `setState` on every prop
 * change is a React anti-pattern the lint config catches; `key` is the
 * idiomatic fix).
 */
export function PlaygroundToolPanel({ projectId, toolConfig }: { projectId: string; toolConfig: ToolConfig }) {
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const dryRunMutation = useDryRunMutation(projectId);
  const errors = dryRunMutation.error instanceof ApiRequestError ? dryRunMutation.error.errors : [];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{en.playgroundInputsHeading}</h3>
        <ToolInputForm toolConfig={toolConfig} values={rawValues} onChange={(name, value) => setRawValues((prev) => ({ ...prev, [name]: value }))} />
        <Button
          className="w-fit"
          disabled={dryRunMutation.isPending}
          onClick={() => dryRunMutation.mutate({ toolName: toolConfig.name, input: coerceInputs(rawValues), env: {} })}
        >
          {dryRunMutation.isPending ? en.playgroundDryRunRunning : en.playgroundDryRunSubmit}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{en.playgroundRequestHeading}</h3>
        <ProductErrorPanel errors={errors} />
        {dryRunMutation.data ? (
          <>
            <RequestPreview result={dryRunMutation.data} />
            {dryRunMutation.data.diagnostics.length > 0 && <DiagnosticList diagnostics={dryRunMutation.data.diagnostics} />}
          </>
        ) : (
          !dryRunMutation.isPending && <p className="text-sm text-muted-foreground">{en.playgroundNoResultYet}</p>
        )}
      </div>
    </div>
  );
}
