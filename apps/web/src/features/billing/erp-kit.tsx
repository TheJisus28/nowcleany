import type { ReactNode } from 'react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Dialog } from '../../components/dialog';
import { Button, cn } from '../../components/ui';
import { formatCop } from '../../lib/format';

/*
 * Small pieces shared by the sales, billing and accounting screens (traditional ERP layout).
 * The generic building blocks live in components/erp; these only fill the gaps of these screens.
 */

/** The compact title of a consultation or report: with only work tabs above, it says where the user is. */
export function ScreenTitle({
  title,
  description,
  aside,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h1
          title={typeof description === 'string' ? description : undefined}
          className="text-[20px] leading-tight font-semibold [font-stretch:108%]"
        >
          {title}
        </h1>
      </div>
      {aside ? <div className="text-[13px] text-ink-2">{aside}</div> : null}
    </div>
  );
}

/** The heading of a grid inside a screen with several ("Por facturar", "Recibos recientes"…). */
export function GridTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-[14px] font-semibold text-ink">{children}</h2>
      {aside ? <div className="text-[12.5px] text-ink-3">{aside}</div> : null}
    </div>
  );
}

/**
 * Filters of a consultation reflected in the URL: the strip edits a draft and "Consultar" applies it.
 * Values equal to the default stay out of the URL.
 */
export function useQueryFilters<K extends string>(defaults: Readonly<Record<K, string>>) {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(defaults) as K[];
  const applied = Object.fromEntries(
    keys.map((key) => [key, params.get(key) ?? defaults[key]]),
  ) as Record<K, string>;
  const signature = keys.map((key) => `${key}=${applied[key]}`).join('&');
  const [draft, setDraft] = useState<Record<K, string>>(applied);
  const [synced, setSynced] = useState(signature);
  if (synced !== signature) {
    setSynced(signature);
    setDraft(applied);
  }
  return {
    applied,
    draft,
    set: (key: K, value: string) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    submit: () => {
      const next = new URLSearchParams();
      for (const key of keys) if (draft[key] !== defaults[key]) next.set(key, draft[key]);
      setParams(next, { replace: true });
    },
    /** Applies some values right away (drill-down from a row). */
    apply: (patch: Partial<Record<K, string>>) => {
      const merged = { ...applied, ...patch };
      const next = new URLSearchParams();
      for (const key of keys) if (merged[key] !== defaults[key]) next.set(key, merged[key]);
      setParams(next, { replace: true });
    },
  };
}

/** Compact controls for a filter strip. */
export const FILTER_INPUT =
  'h-8 rounded-[5px] border border-line-strong bg-surface px-2 text-[13.5px] text-ink focus-visible:border-brand';

export interface DocColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => ReactNode;
  /** Footer cell (totals row); the first column says "Totales" when another column has a total. */
  total?: ReactNode;
  className?: string;
}

/**
 * A read-only grid inside a document (lines of a saved order or invoice, payments, guides,
 * audit): dense rows, numbers to the right, optional totals row.
 */
export function DocTable<T>({
  label,
  columns,
  rows,
  rowKey,
  empty = 'Sin registros.',
  onOpen,
  rowClassName,
  minWidth = 640,
}: {
  label: string;
  columns: readonly DocColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  onOpen?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  minWidth?: number;
}) {
  const hasTotals = columns.some((column) => column.total !== undefined);
  if (rows.length === 0) {
    return <p className="px-5 py-4 text-[13.5px] text-ink-3">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-[13.5px]"
        style={{ minWidth }}
        aria-label={label}
      >
        <thead>
          <tr className="border-y border-line bg-surface-2/70 text-left text-[12px] text-ink-2">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-3 py-1.5 font-medium whitespace-nowrap first:pl-5 last:pr-5',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              tabIndex={onOpen ? 0 : undefined}
              onDoubleClick={
                onOpen
                  ? () => {
                      onOpen(row);
                    }
                  : undefined
              }
              onKeyDown={
                onOpen
                  ? (event) => {
                      if (event.key === 'Enter' && event.target === event.currentTarget) {
                        event.preventDefault();
                        onOpen(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'border-b border-line outline-none last:border-b-0',
                onOpen && 'hover:bg-brand-soft/40 focus:bg-brand-soft/70',
                rowClassName?.(row),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'h-8 px-3 py-1 align-middle first:pl-5 last:pr-5',
                    column.align === 'right' && 'text-right whitespace-nowrap tabular-nums',
                    column.align === 'center' && 'text-center',
                    column.className,
                  )}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasTotals ? (
          <tfoot>
            <tr className="border-t-2 border-line-strong bg-surface-2/60 font-semibold">
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 py-1.5 first:pl-5 last:pr-5',
                    column.align === 'right' && 'text-right whitespace-nowrap tabular-nums',
                  )}
                >
                  {column.total ?? (index === 0 ? 'Totales' : null)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Pesos in a grid cell. */
export function Money({ value, strong = false }: { value: string | bigint; strong?: boolean }) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', strong && 'font-semibold')}>
      {formatCop(value.toString())}
    </span>
  );
}

/** A one-line status under the document header ("Siguiente paso: …"). */
export function StatusLine({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <p
      className={cn(
        'border-b border-line px-5 py-2 text-[13px]',
        tone === 'warning' ? 'bg-warning-soft/60 text-ink' : 'bg-surface-2/40 text-ink-2',
      )}
    >
      {children}
    </p>
  );
}

/**
 * Double confirmation for what cannot be undone (cancel an order, invoice with pending product):
 * says what will happen and asks once more.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  loading = false,
  disabled = false,
  onConfirm,
  onClose,
  children,
  size = 'md',
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={disabled || loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
