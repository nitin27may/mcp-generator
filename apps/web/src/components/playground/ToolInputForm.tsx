import type { ToolConfig } from '@mcpgen/config-schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { en } from '@/i18n/en';

/** One text field per `tool-input` binding, keyed by its agent-facing `inputName`. Values are raw strings here — `PlaygroundView` coerces them (JSON-parse, falling back to the raw string) before sending. */
export function ToolInputForm({
  toolConfig,
  values,
  onChange,
}: {
  toolConfig: ToolConfig;
  values: Readonly<Record<string, string>>;
  onChange: (inputName: string, value: string) => void;
}) {
  const inputNames = Object.values(toolConfig.bindings)
    .filter((binding) => binding.source === 'tool-input')
    .map((binding) => binding.inputName);

  if (inputNames.length === 0) {
    return <p className="text-sm text-muted-foreground">{en.playgroundNoInputs}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {inputNames.map((inputName) => (
        <div key={inputName} className="flex flex-col gap-1">
          <Label htmlFor={`playground-input-${inputName}`}>{inputName}</Label>
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
