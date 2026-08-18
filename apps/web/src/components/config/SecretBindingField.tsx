import type { SecretBinding } from '@mcpgen/config-schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { en } from '@/i18n/en';

/**
 * Deliberately narrower than a generic binding field — it can only ever
 * produce `{source: 'secret', name, provider?}`. There is structurally no
 * path to a literal `value` field in this component's own state, matching
 * `SecretBindingSchema`'s `.strict()` shape (ADR-0006) at the UI layer, not
 * just the schema layer.
 */
export function SecretBindingField({
  label,
  value,
  onChange,
  idPrefix,
}: {
  label: string;
  value: SecretBinding;
  onChange: (next: SecretBinding) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-name`}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          placeholder={en.bindingSecretNameLabel}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
        <Select value={value.provider ?? 'environment'} onValueChange={(provider) => onChange({ ...value, provider: provider as SecretBinding['provider'] })}>
          <SelectTrigger aria-label={en.bindingSecretProviderLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="environment">{en.bindingSecretProviderEnvironment}</SelectItem>
            <SelectItem value="vault-reference">{en.bindingSecretProviderVault}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
