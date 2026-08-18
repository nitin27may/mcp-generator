import type { ToolConfig, ToolInputBinding } from '@mcpgen/config-schema';
import type { OperationDetail } from '@mcpgen/control-contracts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { en } from '@/i18n/en';

function requiredSourceNames(detail: OperationDetail | undefined): ReadonlySet<string> {
  if (!detail) return new Set();
  const required = detail.parameters.filter((p) => p.required).map((p) => p.sourceName);
  const bodyRequired = detail.requestBody?.requiredProperties ?? [];
  return new Set([...required, ...bodyRequired]);
}

/** One text field per `tool-input` binding, keyed by its agent-facing `inputName`. Values are raw strings here — `PlaygroundView` coerces them (JSON-parse, falling back to the raw string) before sending. */
export function ToolInputForm({
  toolConfig,
  operationDetail,
  values,
  onChange,
}: {
  toolConfig: ToolConfig;
  operationDetail: OperationDetail | undefined;
  values: Readonly<Record<string, string>>;
  onChange: (inputName: string, value: string) => void;
}) {
  // Required-ness is only known once operationDetail has loaded — showing "(optional)" for a
  // field that's actually required while the query is still in flight would be actively wrong,
  // so every field is unmarked (neither badge) until we genuinely know.
  const requiredSources = requiredSourceNames(operationDetail);
  const fields = Object.entries(toolConfig.bindings)
    .filter((entry): entry is [string, ToolInputBinding] => entry[1].source === 'tool-input')
    .map(([sourceName, binding]) => ({
      sourceName,
      inputName: binding.inputName,
      required: operationDetail ? requiredSources.has(sourceName) : undefined,
    }));

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{en.playgroundNoInputs}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map(({ inputName, required }) => (
        <div key={inputName} className="flex flex-col gap-1">
          <Label htmlFor={`playground-input-${inputName}`} required={required === true} optional={required === false}>
            {inputName}
          </Label>
          <Input
            id={`playground-input-${inputName}`}
            value={values[inputName] ?? ''}
            onChange={(event) => onChange(inputName, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
