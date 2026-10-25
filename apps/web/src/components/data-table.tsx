import type { ReactNode } from 'react';
import { cn } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Hidden in the stacked mobile layout. */
  hideOnMobile?: boolean;
}

/**
 * A table on wide screens; on phones each row becomes a card (first column as its title), so nothing
 * needs horizontal scrolling on the plant floor.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  rowClassName,
  label,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: ((row: T) => void) | undefined;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  label: string;
}) {
  if (rows.length === 0) return <>{empty}</>;
  const [first, ...rest] = columns;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm" aria-label={label}>
          <thead>
            <tr className="border-b border-line bg-surface-2/70">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-2.5 text-[12.5px] font-medium whitespace-nowrap text-ink-2',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={
                  onRowClick
                    ? () => {
                        onRowClick(row);
                      }
                    : undefined
                }
                className={cn(
                  'border-b border-line last:border-b-0',
                  onRowClick && 'cursor-pointer hover:bg-brand-soft/50',
                  rowClassName?.(row),
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 align-middle',
                      column.align === 'right' && 'text-right tabular-nums',
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden" aria-label={label}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={rowClassName?.(row)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={
                onRowClick
                  ? () => {
                      onRowClick(row);
                    }
                  : undefined
              }
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter') onRowClick(row);
                    }
                  : undefined
              }
              className={cn('px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-brand-soft/50')}
            >
              {first ? <div className="mb-2 font-medium">{first.render(row)}</div> : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                {rest
                  .filter((column) => !column.hideOnMobile)
                  .map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-ink-3">{column.header}</dt>
                      <dd className="truncate">{column.render(row)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
