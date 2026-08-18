import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STATUS_META: Record<Exclude<SaveStatus, 'idle'>, { label: string; Icon: typeof Loader2 }> = {
  saving: { label: 'Saving…', Icon: Loader2 },
  saved: { label: 'Saved', Icon: Check },
  error: { label: 'Save failed', Icon: AlertTriangle },
};

/** `aria-live="polite"` so save-state changes are announced without stealing focus. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return <span aria-live="polite" className="sr-only" />;

  const { label, Icon } = STATUS_META[status];
  return (
    <span aria-live="polite" className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon aria-hidden="true" className={cn('size-3.5', status === 'saving' && 'animate-spin')} />
      {label}
    </span>
  );
}
