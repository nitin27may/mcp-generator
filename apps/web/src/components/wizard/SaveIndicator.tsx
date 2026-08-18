import { Loader2, Check, AlertTriangle, GitMerge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SaveStatus } from '@/wizard/state';
export type { SaveStatus };

const STATUS_META: Record<Exclude<SaveStatus, 'idle'>, { label: string; Icon: typeof Loader2; className: string }> = {
  saving: { label: 'Saving…', Icon: Loader2, className: 'text-muted-foreground' },
  saved: { label: 'Saved', Icon: Check, className: 'text-success' },
  error: { label: 'Save failed', Icon: AlertTriangle, className: 'text-destructive' },
  conflict: { label: 'Conflict', Icon: GitMerge, className: 'text-amber-600 dark:text-amber-500' },
};

/** `aria-live="polite"` so save-state changes are announced without stealing focus. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return <span aria-live="polite" className="sr-only" />;

  const { label, Icon, className } = STATUS_META[status];
  return (
    <span aria-live="polite" className={cn('flex items-center gap-1 text-xs', className)}>
      <Icon aria-hidden="true" className={cn('size-3.5', status === 'saving' && 'animate-spin')} />
      {label}
    </span>
  );
}
