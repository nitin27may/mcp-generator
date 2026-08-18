import type { EnvironmentBinding, SecretBinding, StaticBinding } from '@mcpgen/config-schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { en } from '@/i18n/en';

export type BindableValue = EnvironmentBinding | StaticBinding | SecretBinding;
type BindableKind = BindableValue['source'];

const KIND_LABELS: Record<BindableKind, string> = {
  environment: en.bindingKindEnvironment,
  static: en.bindingKindStatic,
  secret: en.bindingKindSecret,
};

function emptyForKind(kind: BindableKind): BindableValue {
  switch (kind) {
    case 'environment':
      return { source: 'environment', name: '' };
    case 'static':
      return { source: 'static', value: '' };
    case 'secret':
      return { source: 'secret', name: '' };
  }
}

/**
 * A restricted binding editor for global (non-per-call) config fields —
 * base URL, auth credentials. Deliberately omits `tool-input` from the
 * selectable kinds even though `ValueBindingSchema` permits it: a
 * per-call-varying credential is schema-legal but not something this wizard
 * offers, since it would produce a confusingly-scoped config (a hand-edit
 * to `config.json` remains available for that case).
 */
export function ValueBindingField({
  label,
  value,
  onChange,
  allowedKinds,
  idPrefix,
}: {
  label: string;
  value: BindableValue;
  onChange: (next: BindableValue) => void;
  allowedKinds: readonly BindableKind[];
  idPrefix: string;
}) {
  function handleKindChange(kind: string | null) {
    if (kind === null || kind === value.source) return;
    onChange(emptyForKind(kind as BindableKind));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-field`}>{label}</Label>
      <div className="flex gap-2">
        {allowedKinds.length > 1 && (
          <Select value={value.source} onValueChange={handleKindChange}>
            <SelectTrigger aria-label={en.bindingKindLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedKinds.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.source === 'environment' && (
          <Input
            id={`${idPrefix}-field`}
            value={value.name}
            placeholder={en.bindingEnvNameLabel}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        )}
        {value.source === 'static' && (
          <Input
            id={`${idPrefix}-field`}
            value={String(value.value ?? '')}
            placeholder={en.bindingStaticValueLabel}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
          />
        )}
        {value.source === 'secret' && (
          <Input
            id={`${idPrefix}-field`}
            value={value.name}
            placeholder={en.bindingSecretNameLabel}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        )}
      </div>
    </div>
  );
}
