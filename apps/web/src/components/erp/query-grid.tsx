import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import { type ReactNode, type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../ui';
import { PrintHeader } from './print';

export interface QueryColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Value used to sort by this column (clicking its header). */
  sort?: (row: T) => string | number;
  /** Plain value for the Excel export; columns without it are left out. */
  csv?: (row: T) => string | number;
  /** Footer cell (totals row). */
  total?: (rows: readonly T[]) => ReactNode;
  className?: string;
  /** Hidden in the stacked phone layout. */
  hideOnMobile?: boolean;
}

/** The filter strip above a consultation: compact fields and the "Consultar" button. */
export function FilterBar({
  children,
  onSubmit,
  submitLabel = 'Consultar',
}: {
  children: ReactNode;
  /** Without it the filters apply as they change (no button). */
  onSubmit?: () => void;
  submitLabel?: string;
}) {
  return (
    <form
      onSubmit={(event: SyntheticEvent) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="no-print flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line bg-surface-2/50 px-4 py-2.5"
    >
      {children}
      {onSubmit ? (
        <button
          type="submit"
          className="h-8 rounded-[5px] bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-strong"
        >
          {submitLabel}
        </button>
      ) : null}
    </form>
  );
}

/** A labeled filter: "Desde", "Cliente", "Estado"… */
export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-0.5 text-[12px] font-medium text-ink-3', className)}>
      {label}
      <span className="text-[13.5px] font-normal text-ink [&_input]:h-8 [&_select]:h-8">
        {children}
      </span>
    </label>
  );
}

interface ColumnPrefs {
  order: string[];
  hidden: string[];
}

function readPrefs(key: string): ColumnPrefs | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ColumnPrefs) : null;
  } catch {
    return null;
  }
}

function writePrefs(key: string, prefs: ColumnPrefs): void {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Private mode: the choice lasts until reload.
  }
}

/** Show, hide and reorder the columns of a consultation; remembered in this browser. */
function ColumnsMenu({
  columns,
  prefs,
  onChange,
}: {
  columns: readonly { key: string; header: string }[];
  prefs: ColumnPrefs;
  onChange: (prefs: ColumnPrefs) => void;
}) {
  const [open, setOpen] = useState(false);
  const ordered = prefs.order
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is { key: string; header: string } => Boolean(column));
  const move = (index: number, delta: number) => {
    const order = ordered.map((column) => column.key);
    const [item] = order.splice(index, 1);
    if (item === undefined) return;
    order.splice(index + delta, 0, item);
    onChange({ ...prefs, order });
  };
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <Columns3 aria-hidden className="size-4" />
        Columnas
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-line bg-surface p-1.5 shadow-lg">
          <ul className="max-h-80 overflow-y-auto">
            {ordered.map((column, index) => (
              <li
                key={column.key}
                className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-surface-2"
              >
                <label className="flex flex-1 items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!prefs.hidden.includes(column.key)}
                    disabled={index === 0}
                    onChange={() => {
                      onChange({
                        ...prefs,
                        hidden: prefs.hidden.includes(column.key)
                          ? prefs.hidden.filter((key) => key !== column.key)
                          : [...prefs.hidden, column.key],
                      });
                    }}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  {column.header}
                </label>
                <button
                  type="button"
                  disabled={index <= 1}
                  onClick={() => {
                    move(index, -1);
                  }}
                  className="rounded p-0.5 text-ink-3 hover:text-ink disabled:opacity-30"
                  aria-label={`Subir ${column.header}`}
                >
                  <ArrowUp aria-hidden className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === 0 || index === ordered.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                  className="rounded p-0.5 text-ink-3 hover:text-ink disabled:opacity-30"
                  aria-label={`Bajar ${column.header}`}
                >
                  <ArrowDown aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-between border-t border-line px-1.5 pt-1.5">
            <button
              type="button"
              onClick={() => {
                onChange({ order: columns.map((column) => column.key), hidden: [] });
              }}
              className="text-[12.5px] text-ink-2 hover:text-ink"
            >
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              className="text-[12.5px] font-medium text-brand"
            >
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(
  name: string,
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
) {
  const lines = [header, ...rows].map((line) => line.map(csvCell).join(';'));
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * A consultation grid as in traditional systems: dense rows, sortable headers, totals row, record count,
 * export to Excel and print. Double click or Enter opens the record; arrows move between rows; with
 * `selectable`, Space or the checkbox selects rows for a batch action.
 */
export function QueryGrid<T>({
  title,
  columns,
  rows,
  rowKey,
  onOpen,
  selectable = false,
  selected,
  onSelectedChange,
  isSelectable,
  actions,
  exportName,
  empty = 'No hay registros con estos filtros.',
  rowClassName,
  initialSort,
  pageSize = 50,
}: {
  /** Shown in the print heading and the export file name. */
  title: string;
  columns: readonly QueryColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (keys: Set<string>) => void;
  /** Rows that can be selected (the rest show no checkbox). */
  isSelectable?: (row: T) => boolean;
  /** Batch actions next to the record count. */
  actions?: ReactNode;
  exportName?: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  /** Rows per page (pagination, never infinite scroll). */
  pageSize?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const prefsKey = `scip.grid.${title}`;
  const [prefs, setPrefs] = useState<ColumnPrefs>(() => {
    const stored = readPrefs(prefsKey);
    const keys = columns.map((column) => column.key);
    if (!stored) return { order: keys, hidden: [] };
    // New columns added since the choice was saved go at the end.
    return {
      order: [
        ...stored.order.filter((key) => keys.includes(key)),
        ...keys.filter((key) => !stored.order.includes(key)),
      ],
      hidden: stored.hidden.filter((key) => keys.includes(key)),
    };
  });
  const savePrefs = (next: ColumnPrefs) => {
    setPrefs(next);
    writePrefs(prefsKey, next);
  };
  const shown = prefs.order
    .filter((key) => !prefs.hidden.includes(key))
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is QueryColumn<T> => Boolean(column));
  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(0);
  const body = useRef<HTMLTableSectionElement>(null);
  const sorted = useMemo(() => {
    const column = sort ? columns.find((item) => item.key === sort.key) : undefined;
    if (!sort || !column?.sort) return rows;
    const value = column.sort;
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'es');
      return sort.direction === 'asc' ? order : -order;
    });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  useEffect(() => {
    setPage(0);
  }, [rows.length, size]);
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * size, current * size + size);
  const hasTotals = shown.some((column) => column.total);
  const chosen = selected ?? new Set<string>();
  const selectableRows = sorted.filter((row) => (isSelectable ? isSelectable(row) : true));
  const allSelected =
    selectableRows.length > 0 && selectableRows.every((row) => chosen.has(rowKey(row)));
  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange?.(next);
  };
  const focusRow = (index: number) => {
    const rowsElements = body.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row]');
    rowsElements?.[Math.max(0, Math.min(index, rowsElements.length - 1))]?.focus();
  };
  const exportable = shown.filter((column) => column.csv);
  const [first, ...rest] = shown;

  return (
    <div className="rounded-[8px] border border-line bg-surface print:border-0">
      <PrintHeader title={title} />
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <span className="text-[13px] text-ink-2 tabular-nums">
          {sorted.length === 1
            ? '1 registro'
            : `${sorted.length.toLocaleString('es-CO')} registros`}
          {selectable && chosen.size > 0 ? ` · ${String(chosen.size)} seleccionados` : ''}
        </span>
        {actions ? <div className="flex flex-wrap gap-1.5">{actions}</div> : null}
        <span className="flex-1" />
        <ColumnsMenu columns={columns} prefs={prefs} onChange={savePrefs} />
        {exportable.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              downloadCsv(
                exportName ?? title.toLowerCase().replace(/\s+/g, '-'),
                exportable.map((column) => column.header),
                sorted.map((row) => exportable.map((column) => column.csv?.(row) ?? '')),
              );
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <FileSpreadsheet aria-hidden className="size-4" />
            Exportar a Excel
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <Printer aria-hidden className="size-4" />
          Imprimir
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-ink-3">{empty}</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block print:block">
            <table className="w-full border-collapse text-[13.5px]" aria-label={title}>
              <thead className="sticky top-0 z-[1]">
                <tr className="border-b border-line bg-surface-2 text-left text-[12px] text-ink-2">
                  {selectable ? (
                    <th className="no-print w-9 px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={allSelected}
                        onChange={() => {
                          onSelectedChange?.(
                            allSelected ? new Set() : new Set(selectableRows.map(rowKey)),
                          );
                        }}
                        className="size-4 accent-[var(--color-brand)]"
                      />
                    </th>
                  ) : null}
                  {shown.map((column) => {
                    const active = sort?.key === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          active
                            ? sort.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        className={cn(
                          'px-3 py-2 font-medium whitespace-nowrap',
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                        )}
                      >
                        {column.sort ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSort({
                                key: column.key,
                                direction: active && sort.direction === 'asc' ? 'desc' : 'asc',
                              });
                            }}
                            className="inline-flex items-center gap-1 hover:text-ink"
                          >
                            {column.header}
                            {active ? (
                              sort.direction === 'asc' ? (
                                <ChevronUp aria-hidden className="size-3.5" />
                              ) : (
                                <ChevronDown aria-hidden className="size-3.5" />
                              )
                            ) : null}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody ref={body}>
                {visible.map((row, index) => {
                  const key = rowKey(row);
                  const canSelect = selectable && (isSelectable ? isSelectable(row) : true);
                  return (
                    <tr
                      key={key}
                      data-row
                      tabIndex={0}
                      onDoubleClick={
                        onOpen
                          ? () => {
                              onOpen(row);
                            }
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' && onOpen) {
                          event.preventDefault();
                          onOpen(row);
                        } else if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          focusRow(index + 1);
                        } else if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          focusRow(index - 1);
                        } else if (event.key === ' ' && canSelect) {
                          event.preventDefault();
                          toggle(key);
                        }
                      }}
                      className={cn(
                        'border-b border-line outline-none last:border-b-0 hover:bg-brand-soft/40 focus:bg-brand-soft/70',
                        onOpen && 'cursor-default',
                        chosen.has(key) && 'bg-brand-soft/60',
                        rowClassName?.(row),
                      )}
                    >
                      {selectable ? (
                        <td className="no-print px-2 py-1.5">
                          {canSelect ? (
                            <input
                              type="checkbox"
                              aria-label="Seleccionar"
                              checked={chosen.has(key)}
                              onChange={() => {
                                toggle(key);
                              }}
                              className="size-4 accent-[var(--color-brand)]"
                            />
                          ) : null}
                        </td>
                      ) : null}
                      {shown.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'px-3 py-1.5 align-middle',
                            column.align === 'right' && 'text-right tabular-nums',
                            column.align === 'center' && 'text-center',
                            column.className,
                          )}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              {hasTotals ? (
                <tfoot>
                  <tr className="border-t-2 border-line-strong bg-surface-2/70 font-semibold">
                    {selectable ? <td className="no-print" /> : null}
                    {shown.map((column, index) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-3 py-2',
                          column.align === 'right' && 'text-right tabular-nums',
                        )}
                      >
                        {column.total ? column.total(sorted) : index === 0 ? 'Totales' : null}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <ul className="divide-y divide-line md:hidden print:hidden" aria-label={title}>
            {visible.map((row) => {
              const key = rowKey(row);
              const canSelect = selectable && (isSelectable ? isSelectable(row) : true);
              return (
                <li
                  key={key}
                  className={cn('flex gap-3 px-4 py-3', chosen.has(key) && 'bg-brand-soft/60')}
                >
                  {canSelect ? (
                    <input
                      type="checkbox"
                      aria-label="Seleccionar"
                      checked={chosen.has(key)}
                      onChange={() => {
                        toggle(key);
                      }}
                      className="mt-1 size-4 accent-[var(--color-brand)]"
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={!onOpen}
                    onClick={
                      onOpen
                        ? () => {
                            onOpen(row);
                          }
                        : undefined
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    {first ? <div className="mb-1.5 font-medium">{first.render(row)}</div> : null}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                      {rest
                        .filter((column) => !column.hideOnMobile)
                        .map((column) => (
                          <div key={column.key} className="min-w-0">
                            <dt className="text-ink-3">{column.header}</dt>
                            <dd className="truncate">{column.render(row)}</dd>
                          </div>
                        ))}
                    </dl>
                  </button>
                </li>
              );
            })}
          </ul>
          {sorted.length > size ? (
            <div className="no-print flex flex-wrap items-center justify-end gap-3 border-t border-line px-4 py-2 text-[13px] text-ink-2">
              <label className="flex items-center gap-1.5">
                Filas por página
                <select
                  value={size}
                  onChange={(event) => {
                    setSize(Number(event.target.value));
                  }}
                  className="h-7 rounded border border-line-strong bg-surface px-1"
                >
                  {[25, 50, 100, 200].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                {(current * size + 1).toLocaleString('es-CO')}–
                {Math.min(sorted.length, (current + 1) * size).toLocaleString('es-CO')} de{' '}
                {sorted.length.toLocaleString('es-CO')} · página {current + 1} de {pages}
              </span>
              <span className="flex gap-0.5">
                <button
                  type="button"
                  disabled={current === 0}
                  onClick={() => {
                    setPage(current - 1);
                  }}
                  className="rounded p-1 hover:bg-surface-2 disabled:opacity-40"
                  aria-label="Página anterior"
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={current >= pages - 1}
                  onClick={() => {
                    setPage(current + 1);
                  }}
                  className="rounded p-1 hover:bg-surface-2 disabled:opacity-40"
                  aria-label="Página siguiente"
                >
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
