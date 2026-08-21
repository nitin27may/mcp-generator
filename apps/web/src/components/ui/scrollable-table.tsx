import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A table that scrolls horizontally instead of dragging the whole page sideways.
 *
 * The wizard's tables cannot compress: `Badge` and `Select` are `whitespace-nowrap`, and
 * the content is method/path pairs, tool names and SCREAMING_SNAKE env var names. Left
 * bare, a narrow viewport gets page-level horizontal scroll — the entire layout slides,
 * including the header and the step nav. `min-w` forces the overflow to happen *here*, in
 * a container that owns it.
 *
 * This is the pattern the public /docs page already proved out at 375px; extracting it
 * stops the four wizard tables from each solving it differently, or not at all.
 *
 * `focusable` exists because axe's `scrollable-region-focusable` rule is satisfied either
 * by the region itself being tabbable or by it containing something tabbable. Tables with
 * their own controls (checkboxes, selects) already qualify, and adding `tabIndex` to those
 * would just insert a dead tab stop in front of every row.
 */
export function ScrollableTable({
  label,
  children,
  minWidthClass = 'min-w-[640px]',
  focusable = false,
}: {
  /** Accessible name for the scroll region. Required when `focusable`. */
  label: string;
  children: ReactNode;
  minWidthClass?: string;
  focusable?: boolean;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      {...(focusable ? { tabIndex: 0 } : {})}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className={cn('w-full border-collapse text-sm', minWidthClass)}>{children}</table>
    </div>
  );
}
