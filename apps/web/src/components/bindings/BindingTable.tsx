import type { ValueBinding } from '@mcpgen/config-schema';
import type { OperationDetail } from '@mcpgen/control-contracts';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ValueBindingField } from '@/components/config/ValueBindingField';
import { en } from '@/i18n/en';
import { ScrollableTable } from '@/components/ui/scrollable-table';

interface BindingField {
  readonly sourceName: string;
  readonly location: string;
  readonly required: boolean;
}

function defaultBinding(sourceName: string): ValueBinding {
  return { source: 'tool-input', inputName: sourceName };
}

/**
 * One row per operation parameter + request-body property. A row with no
 * entry in `bindings` is the real, reachable "unbound" state (`Remove`
 * deletes the key entirely, rather than resetting to some placeholder
 * value) — that's what makes `BND-001` a genuine live check here, not one
 * that can never actually trigger because every row always holds *some*
 * binding.
 */
export function BindingTable({
  detail,
  bindings,
  onChange,
}: {
  detail: OperationDetail;
  bindings: Readonly<Record<string, ValueBinding>>;
  onChange: (next: Record<string, ValueBinding>) => void;
}) {
  const fields: BindingField[] = [
    ...detail.parameters.map((p) => ({ sourceName: p.sourceName, location: p.location, required: p.required })),
    ...(detail.requestBody?.properties.map((prop) => ({
      sourceName: prop,
      location: 'body',
      required: detail.requestBody!.requiredProperties.includes(prop),
    })) ?? []),
  ];

  function setBinding(sourceName: string, binding: ValueBinding) {
    onChange({ ...bindings, [sourceName]: binding });
  }

  function removeBinding(sourceName: string) {
    const { [sourceName]: _removed, ...rest } = bindings;
    onChange(rest);
  }

  return (
    <div className="flex flex-col gap-3">
      {detail.requestBody && fields.some((f) => f.location === 'body') && (
        <p className="text-xs font-medium text-muted-foreground">{en.bindingsRequestBodyHeading}</p>
      )}
      <ScrollableTable label={en.bindingsTableLabel} minWidthClass="min-w-[680px]">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">{en.bindingsColumnParameter}</th>
            <th className="py-2 pr-2 font-medium">{en.bindingsColumnLocation}</th>
            <th className="py-2 pr-2 font-medium">{en.bindingsColumnBinding}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const binding = bindings[field.sourceName];
            const unbound = binding === undefined;
            return (
              <tr key={field.sourceName} className="border-b align-top last:border-0">
                <td className="py-2 pr-2">
                  <span className="font-mono text-xs">{field.sourceName}</span>
                  {field.required && (
                    <Badge variant="outline" className="ml-1.5">
                      required
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-2 text-xs text-muted-foreground">{field.location}</td>
                <td className="py-2 pr-2">
                  {unbound ? (
                    <div className="flex flex-col gap-1">
                      <Button variant="outline" size="sm" onClick={() => setBinding(field.sourceName, defaultBinding(field.sourceName))}>
                        Bind
                      </Button>
                      {field.required && <p className="text-xs text-destructive">{en.bindingsUnboundError(field.sourceName)}</p>}
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <ValueBindingField
                        label={`Binding for ${field.sourceName}`}
                        hideLabel
                        value={binding}
                        onChange={(next) => setBinding(field.sourceName, next)}
                        allowedKinds={['tool-input', 'environment', 'secret', 'static']}
                        idPrefix={`binding-${field.sourceName}`}
                      />
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove binding for ${field.sourceName}`} onClick={() => removeBinding(field.sourceName)}>
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </ScrollableTable>
    </div>
  );
}
