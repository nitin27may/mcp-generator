'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { OperationSummary } from '@mcpgen/control-contracts';
import type { ToolConfig } from '@mcpgen/config-schema';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { RiskBadge } from './RiskBadge';
import { en } from '@/i18n/en';
import { cn } from '@/lib/utils';

export interface OperationRow {
  readonly summary: OperationSummary;
  readonly tool: ToolConfig;
}

/**
 * 1D roving tabindex over rows (arrow up/down/Home/End move focus; Enter/Space
 * opens the tool designer for the focused row) layered on a native `<table>`
 * — the enable checkbox remains independently reachable via Tab. `aria-sort`
 * on the one sortable header (path), `aria-selected` on the row whose tool is
 * currently open in the designer panel.
 */
export function OperationTable({
  rows,
  selectedId,
  onSelect,
  onToggleEnabled,
  sortDirection,
  onToggleSort,
}: {
  rows: readonly OperationRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  sortDirection: 'asc' | 'desc' | null;
  onToggleSort: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  function focusRow(index: number) {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    setActiveIndex(clamped);
    rowRefs.current[clamped]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, index: number) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        focusRow(rows.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(rows[index]!.summary.id);
        break;
      default:
        break;
    }
  }

  const SortIcon = sortDirection === 'asc' ? ArrowUp : sortDirection === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="w-10 py-2 pr-2 font-medium">{en.toolsColumnEnabled}</th>
          <th className="py-2 pr-2 font-medium" aria-sort={sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none'}>
            <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={onToggleSort}>
              {en.toolsColumnOperation}
              <SortIcon aria-hidden="true" className="size-3.5" />
            </button>
          </th>
          <th className="py-2 pr-2 font-medium">{en.toolsColumnName}</th>
          <th className="py-2 pr-2 font-medium">{en.toolsColumnRisk}</th>
          <th className="py-2 pr-2 font-medium">{en.toolsColumnFindings}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isSelected = row.summary.id === selectedId;
          return (
            <tr
              key={row.summary.id}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              tabIndex={index === activeIndex ? 0 : -1}
              aria-selected={isSelected}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => onSelect(row.summary.id)}
              className={cn('cursor-pointer border-b outline-none last:border-0 hover:bg-muted focus-visible:bg-muted', isSelected && 'bg-muted')}
            >
              <td className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={row.tool.enabled}
                  aria-label={`${en.toolsColumnEnabled}: ${row.summary.method} ${row.summary.path}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={() => onToggleEnabled(row.summary.id)}
                />
              </td>
              <td className="py-2 pr-2">
                <span className="font-mono text-xs">{row.summary.method}</span> {row.summary.path}
                {row.summary.deprecated && <span className="ml-1 text-xs text-muted-foreground">(deprecated)</span>}
              </td>
              <td className="py-2 pr-2 font-mono text-xs">{row.tool.name}</td>
              <td className="py-2 pr-2">
                <RiskBadge classification={row.summary.risk.classification} reasons={row.summary.risk.reasons} />
              </td>
              <td className="py-2 pr-2 tabular-nums text-muted-foreground">{row.summary.readinessFindingCount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
