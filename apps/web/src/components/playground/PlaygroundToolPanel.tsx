'use client';

import { useState } from 'react';
import type { McpProjectConfig, ToolConfig } from '@mcpgen/config-schema';
import type { OperationDetail } from '@mcpgen/control-contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToolInputForm } from './ToolInputForm';
import { RequestPreview } from './RequestPreview';
import { TracePanel } from './TracePanel';
import { RiskAcknowledgeDialog } from './RiskAcknowledgeDialog';
import { DiagnosticList } from '@/components/diagnostics/DiagnosticList';
import { ProductErrorPanel } from '@/components/diagnostics/ProductErrorPanel';
import { useDryRunMutation, useExecuteMutation } from '@/api-client/mutations';
import { ApiRequestError } from '@/api-client/client';
import { secretNamesFor } from '@/lib/secret-bindings';
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

const RISK_REQUIRES_ACKNOWLEDGEMENT: ReadonlySet<ToolConfig['risk']> = new Set(['DESTRUCTIVE', 'PRIVILEGED']);

/**
 * Mounted with `key={tool.name}` by its caller — switching tools remounts
 * this component fresh, which is what actually resets all of this local
 * state, including session-only secret values (an effect that calls
 * `setState` on every prop change is a React anti-pattern the lint config
 * catches; `key` is the idiomatic fix).
 */
export function PlaygroundToolPanel({
  projectId,
  config,
  toolConfig,
  operationDetail,
}: {
  projectId: string;
  config: McpProjectConfig;
  toolConfig: ToolConfig;
  operationDetail: OperationDetail | undefined;
}) {
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const dryRunMutation = useDryRunMutation(projectId);
  const executeMutation = useExecuteMutation(projectId);

  const dryRunErrors = dryRunMutation.error instanceof ApiRequestError ? dryRunMutation.error.errors : [];
  const executeErrors = executeMutation.error instanceof ApiRequestError && executeMutation.error.status !== 428 ? executeMutation.error.errors : [];
  const secretNames = secretNamesFor(config, toolConfig);

  function runExecute() {
    executeMutation.mutate({ toolName: toolConfig.name, input: coerceInputs(rawValues), env: {}, secrets: secretValues, acknowledgeRisk: true });
  }

  function handleExecuteClick() {
    if (RISK_REQUIRES_ACKNOWLEDGEMENT.has(toolConfig.risk)) {
      setRiskDialogOpen(true);
      return;
    }
    runExecute();
  }

  const latestTrace = executeMutation.data;
  const showExecutePanel = executeMutation.isPending || latestTrace !== undefined || executeErrors.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{en.playgroundInputsHeading}</h3>
        <ToolInputForm
          toolConfig={toolConfig}
          operationDetail={operationDetail}
          values={rawValues}
          onChange={(name, value) => setRawValues((prev) => ({ ...prev, [name]: value }))}
        />

        {secretNames.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
            <p className="text-xs font-medium">{en.playgroundSecretsHeading}</p>
            <p className="text-xs text-muted-foreground">{en.playgroundSecretsBody}</p>
            {secretNames.map((name) => (
              <div key={name} className="flex flex-col gap-1">
                <Label htmlFor={`secret-${name}`}>{name}</Label>
                <Input
                  id={`secret-${name}`}
                  type="password"
                  autoComplete="off"
                  value={secretValues[name] ?? ''}
                  onChange={(event) => setSecretValues((prev) => ({ ...prev, [name]: event.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={dryRunMutation.isPending}
            onClick={() => dryRunMutation.mutate({ toolName: toolConfig.name, input: coerceInputs(rawValues), env: {} })}
          >
            {dryRunMutation.isPending ? en.playgroundDryRunRunning : en.playgroundDryRunSubmit}
          </Button>
          <Button variant="destructive" disabled={executeMutation.isPending} onClick={handleExecuteClick}>
            {executeMutation.isPending ? en.playgroundExecuteRunning : en.playgroundExecuteSubmit}
          </Button>
        </div>

        <RiskAcknowledgeDialog
          open={riskDialogOpen}
          toolName={toolConfig.name}
          onOpenChange={setRiskDialogOpen}
          onConfirm={() => {
            setRiskDialogOpen(false);
            runExecute();
          }}
        />
      </div>

      <div className="flex flex-col gap-4">
        {showExecutePanel ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{en.playgroundTraceHeading}</h3>
            <ProductErrorPanel errors={executeErrors} />
            {executeMutation.error instanceof ApiRequestError && executeMutation.error.status === 428 && (
              <Alert variant="destructive">
                <AlertDescription>{executeMutation.error.errors[0]?.message}</AlertDescription>
              </Alert>
            )}
            {latestTrace && <TracePanel trace={latestTrace} />}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{en.playgroundRequestHeading}</h3>
            <ProductErrorPanel errors={dryRunErrors} />
            {dryRunMutation.data ? (
              <>
                <RequestPreview result={dryRunMutation.data} />
                {dryRunMutation.data.diagnostics.length > 0 && <DiagnosticList diagnostics={dryRunMutation.data.diagnostics} />}
              </>
            ) : (
              !dryRunMutation.isPending && <p className="text-sm text-muted-foreground">{en.playgroundNoResultYet}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
