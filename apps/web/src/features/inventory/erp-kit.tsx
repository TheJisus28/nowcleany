import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Q } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Button, cn } from '../../components/ui';
import { daysUntil, formatDate, formatDecimal, roundUpDecimal, unitLabel } from '../../lib/format';

/*
 * Small pieces shared by the ERP screens of plant, logistics, inventory, purchasing and catalog,
 * on top of src/components/erp (compact fields, consultation panel, URL filters, confirmations,
 * totals by unit, previous / next document).
 */

/** Compact controls of documents and filter strips (32 px, like the grid rows). */
export const INPUT =
  'h-8 w-full rounded-[5px] border border-line-strong bg-surface px-2 text-[13.5px] text-ink placeholder:text-ink-3 focus-visible:border-brand disabled:bg-surface-2 disabled:text-ink-2 aria-invalid:border-critical';
export const SELECT =
  'h-8 rounded-[5px] border border-line-strong bg-surface pr-7 pl-2 text-[13.5px] text-ink focus-visible:border-brand disabled:bg-surface-2';
export const TEXTAREA =
  'min-h-16 w-full rounded-[5px] border border-line-strong bg-surface px-2 py-1.5 text-[13.5px] text-ink placeholder:text-ink-3 focus-visible:border-brand';

/** The title of a consultation or report under its toolbar. */
export function ScreenTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] leading-tight font-semibold [font-stretch:108%]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** A consultation: optional heading, the filter strip and the grid in one frame. */
export function QueryPanel({
  title,
  description,
  filters,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'mb-5 rounded-[8px] border border-line bg-surface print:mb-8 print:border-0',
        className,
      )}
    >
      {title ? (
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {description ? <p className="text-[12.5px] text-ink-3">{description}</p> : null}
        </header>
      ) : null}
      {filters}
      <div className="[&>div]:rounded-none [&>div]:border-0">{children}</div>
    </section>
  );
}

/**
 * Filters of a consultation kept in the URL (so a consultation can be cited and reopened): the user
 * edits a draft and "Consultar" applies it. `defaults` must be a module constant.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const applied = useMemo(() => {
    const current = new URLSearchParams(search);
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, current.get(key) ?? value]),
    ) as T;
  }, [search, defaults]);
  const [draft, setDraft] = useState<T>(applied);
  useEffect(() => {
    setDraft(applied);
  }, [applied]);
  const set = (key: keyof T, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const apply = (next: T = draft) => {
    const updated = new URLSearchParams(search);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== defaults[key]) updated.set(key, value);
      else updated.delete(key);
    }
    setParams(updated, { replace: true });
  };
  /** Changes one filter and applies it right away (selects that are part of the screen). */
  const applyNow = (key: keyof T, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    apply(next);
  };
  return { applied, draft, set, apply, applyNow };
}

/** Confirmation of something irreversible, saying what will happen. */
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
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            disabled={disabled}
            autoFocus
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? (
        <p className="text-sm text-ink-2">Queda registrado en la auditoría con tu nombre.</p>
      )}
    </Dialog>
  );
}

// --- exact quantities ----------------------------------------------------------------------------

function toScaled(value: string, scale: number): bigint {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(`${integer}${fraction.padEnd(scale, '0')}`);
  return negative ? -result : result;
}

function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`;
}

const scaleOf = (value: string) => value.split('.')[1]?.length ?? 0;

/** Exact signed sum of decimal strings ("1.5" + "-0.25" = "1.25"). */
export function addDecimals(...values: string[]): string {
  const scale = Math.max(0, ...values.map(scaleOf));
  return fromScaled(
    values.reduce((sum, value) => sum + toScaled(value, scale), 0n),
    scale,
  );
}

/** Exact a × n for a decimal string and an integer ("200" × 3 = "600"). */
export function multiplyDecimal(value: string, times: number): string {
  const scale = scaleOf(value);
  return fromScaled(toScaled(value, scale) * BigInt(times), scale);
}

/** Totals of mixed products, one per unit: "1.200 L · 340 und". */
export function sumByUnit(values: readonly Q[]): { quantity: string; unit: string }[] {
  const totals = new Map<string, string>();
  for (const value of values) {
    totals.set(value.unit, addDecimals(totals.get(value.unit) ?? '0', value.quantity));
  }
  return [...totals.entries()].map(([unit, quantity]) => ({ unit, quantity }));
}

export function QtyTotal({ values }: { values: readonly Q[] }) {
  const totals = sumByUnit(values);
  if (totals.length === 0) return <span className="text-ink-3">—</span>;
  return (
    <span className="whitespace-nowrap">
      {totals.map((total, index) => (
        <span key={total.unit}>
          {index > 0 ? <span className="text-ink-3"> · </span> : null}
          {formatDecimal(roundUpDecimal(total.quantity))}
          <span className="ml-0.5 text-[0.85em] font-normal text-ink-3">
            {unitLabel(total.unit)}
          </span>
        </span>
      ))}
    </span>
  );
}

/** A quantity for the Excel export: no thousands separator, decimal comma. */
export const csvQty = (value: Q | null | undefined): string =>
  value ? value.quantity.replace('.', ',') : '';

/** Local calendar day of an instant ("2026-10-30"). */
export function localDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Inside a [from, to] range of calendar days (either end may be empty). */
export function inRange(day: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!day) return false;
  const value = day.slice(0, 10);
  return (!from || value >= from) && (!to || value <= to);
}

/** Previous / next document of the same kind, in the order of its consultation. */
export function neighbors(
  ids: readonly string[] | undefined,
  current: string | undefined,
  path: (id: string) => string,
): { previous: string | null; next: string | null } {
  if (!ids || !current) return { previous: null, next: null };
  const index = ids.indexOf(current);
  if (index < 0) return { previous: null, next: null };
  const previous = ids[index - 1];
  const next = ids[index + 1];
  return { previous: previous ? path(previous) : null, next: next ? path(next) : null };
}

/**
 * A calendar date as traditional systems print it ("3 nov 2026"); when something pending is past
 * that date it says so with an icon and a word, not only color.
 */
export function DateCell({
  date,
  pending = false,
  lateLabel = 'Vencido',
}: {
  date: string | null | undefined;
  pending?: boolean;
  lateLabel?: string;
}) {
  if (!date) return <span className="text-ink-3">—</span>;
  const days = daysUntil(date);
  const late = pending && days !== null && days < 0;
  return (
    <span className="whitespace-nowrap">
      {formatDate(date)}
      {late ? (
        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[12px] font-medium text-critical">
          <Clock aria-hidden className="size-3" strokeWidth={2.25} />
          {lateLabel}
        </span>
      ) : null}
    </span>
  );
}

/** The tabs of a screen with several consultations (state kept in the URL by the caller). */
export function TabStrip<T extends string>({
  value,
  tabs,
  onChange,
  label,
}: {
  value: T;
  tabs: readonly { value: T; label: string; count?: number | undefined }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="no-print mb-3 flex gap-0.5 overflow-x-auto border-b border-line"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => {
            onChange(tab.value);
          }}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap',
            value === tab.value
              ? 'border-brand text-ink'
              : 'border-transparent text-ink-2 hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span
              className={cn(
                'rounded-full px-1.5 text-[11.5px] tabular-nums',
                value === tab.value ? 'bg-brand text-white' : 'bg-surface-2 text-ink-2',
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** A notice inside a document (why the step is not available, what will happen). */
export function DocumentNotice({
  tone = 'warning',
  children,
}: {
  tone?: 'warning' | 'info' | 'critical';
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'no-print border-b border-line px-5 py-2.5 text-[13px]',
        tone === 'warning' && 'bg-warning-soft text-ink',
        tone === 'info' && 'bg-brand-soft/60 text-ink-2',
        tone === 'critical' && 'bg-critical-soft text-ink',
      )}
    >
      {children}
    </p>
  );
}

/** Header of a read-only grid inside a document (same look as the line grid). */
export const GRID_HEAD = 'border-y border-line bg-surface-2/70 text-left text-[12px] text-ink-2';
export const GRID_TH = 'px-2 py-1.5 font-medium whitespace-nowrap';
export const GRID_TD = 'px-2 py-1.5 align-middle';

interface QueryState {
  data: unknown;
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Several queries as one for QueryView: ready when all have data. Only pass enabled queries. */
export function combineQueries(...queries: QueryState[]): {
  data: true | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} {
  return {
    data: queries.every((query) => query.data !== undefined) ? true : undefined,
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => {
      for (const query of queries) void query.refetch();
    },
  };
}

/** Read-only value of a document header, muted when empty. */
export function Value({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? (
    <span className="text-ink-3">—</span>
  ) : (
    <>{children}</>
  );
}
