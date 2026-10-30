import type { ReactNode } from 'react';
import { cn } from '../ui';
import { PrintHeader } from './print';

/**
 * A document as traditional systems show it: kind and consecutive number, status, a compact header of
 * fields, the line grid, notes and totals at the bottom and who prepared and authorized it.
 */
export function DocumentScreen({
  kind,
  number,
  status,
  toolbar,
  children,
  notes,
  totals,
  signatures,
}: {
  /** "Pedido de venta", "Factura de venta", "Orden de compra"… */
  kind: string;
  /** Consecutive number ("PV-00031"), or "Nuevo" while it is not saved. */
  number: string;
  status?: ReactNode;
  toolbar?: ReactNode;
  /** Header fields and line grid. */
  children: ReactNode;
  notes?: ReactNode;
  totals?: readonly { label: string; value: ReactNode; strong?: boolean }[];
  signatures?: readonly { label: string; name: string | null | undefined; at?: string | null }[];
}) {
  return (
    <>
      {toolbar}
      <PrintHeader title={`${kind} ${number}`} />
      <article className="rounded-[8px] border border-line bg-surface print:border-0">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <p className="text-[12.5px] text-ink-3">{kind}</p>
            <h1 className="text-[24px] leading-tight font-semibold tabular-nums [font-stretch:110%]">
              {number}
            </h1>
          </div>
          {status ? <div className="flex flex-wrap items-center gap-2">{status}</div> : null}
        </header>
        <div className="flex flex-col gap-0">{children}</div>
        {notes !== undefined || (totals && totals.length > 0) ? (
          <footer className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-[1fr_auto]">
            <div className="text-sm text-ink-2">{notes}</div>
            {totals && totals.length > 0 ? (
              <table className="text-sm tabular-nums sm:min-w-64">
                <tbody>
                  {totals.map((row) => (
                    <tr key={row.label} className={cn(row.strong && 'border-t border-line')}>
                      <th
                        scope="row"
                        className={cn(
                          'py-1 pr-6 text-left font-normal text-ink-2',
                          row.strong && 'pt-2 font-semibold text-ink',
                        )}
                      >
                        {row.label}
                      </th>
                      <td
                        className={cn(
                          'py-1 text-right',
                          row.strong && 'pt-2 text-[16px] font-semibold',
                        )}
                      >
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </footer>
        ) : null}
        {signatures && signatures.length > 0 ? (
          <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
            {signatures.map((signature) => (
              <span key={signature.label}>
                {signature.label}: <span className="text-ink-2">{signature.name ?? '—'}</span>
                {signature.at ? ` · ${signature.at}` : ''}
              </span>
            ))}
          </div>
        ) : null}
      </article>
    </>
  );
}

/** The document header: compact fields, four per row on desktop. */
export function HeaderGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-x-5 gap-y-3 border-b border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A header field: label above, value (text or input) below. */
export function HeaderField({
  label,
  children,
  span = 1,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  /** Columns it takes on desktop (1–4). */
  span?: 1 | 2 | 3 | 4;
  htmlFor?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1',
        span === 2 && 'lg:col-span-2',
        span === 3 && 'lg:col-span-3',
        span === 4 && 'sm:col-span-2 lg:col-span-4',
      )}
    >
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink-3">
        {label}
      </label>
      <div className="min-h-8 text-[14px] text-ink">{children}</div>
    </div>
  );
}

/** A section inside the document (lines, payments, related documents). */
export function DocumentSection({
  title,
  actions,
  children,
  flush = false,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="border-b border-line last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3.5 pb-2">
        <h2 className="text-[13px] font-semibold text-ink-2">{title}</h2>
        {actions ? <div className="no-print flex gap-1">{actions}</div> : null}
      </div>
      <div className={flush ? '' : 'px-5 pb-4'}>{children}</div>
    </section>
  );
}
