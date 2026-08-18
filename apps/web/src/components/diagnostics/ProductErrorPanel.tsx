import type { ProductError } from '@mcpgen/control-contracts';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { en } from '@/i18n/en';

export function ProductErrorPanel({ errors, onDismiss }: { errors: readonly ProductError[]; onDismiss?: () => void }) {
  if (errors.length === 0) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{en.errorGenericTitle}</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {errors.map((error, index) => (
            <li key={`${error.code}-${index}`}>
              <span className="font-mono text-xs">{error.code}</span>{' '}
              {error.message}
              {error.remediation !== undefined && <span className="block text-xs">{error.remediation}</span>}
            </li>
          ))}
        </ul>
      </AlertDescription>
      {onDismiss !== undefined && (
        <AlertAction>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {en.errorDismiss}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
