import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { api } from '../../api/client';
import type { AgingReport, FinanceSummary } from '../../api/types';
import { Legend, type Series } from '../../components/charts';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { cn, QueryView } from '../../components/ui';
import { formatCop, formatCopShort, formatDate, monthLabel, todayIso } from '../../lib/format';
import { AGING_BUCKETS, sumPesos } from '../billing/billing-format';
import {
  type DocColumn,
  DocTable,
  FILTER_INPUT,
  GridTitle,
  Money,
  ScreenTitle,
  useQueryFilters,
} from '../billing/erp-kit';
import { GroupedColumns, niceMax } from './grouped-columns';

type Movement = FinanceSummary['movements'][number] & { key: string };

const SALES_SERIES: Series[] = [
  { key: 'invoiced', label: 'Facturado', fill: 'bg-series-1' },
  { key: 'collected', label: 'Cobrado', fill: 'bg-series-2' },
];

const PURCHASE_SERIES: Series[] = [
  { key: 'bought', label: 'Comprado', fill: 'bg-series-1' },
  { key: 'paid', label: 'Pagado', fill: 'bg-series-2' },
];

const pesos = (value: number) => formatCop(String(Math.round(value)));
const short = (value: number) => formatCopShort(String(Math.round(value)));

/** The summary of a period, keeping the previous one on screen while the next loads. */
function useFinanceSummary(from: string, to: string) {
  return useQuery({
    queryKey: ['finance', { from, to }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<FinanceSummary>(`/v1/finance/summary?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** "Cobros y pagos": printable report of collections, payments and balances by age. */
export function FinancePage() {
  useWorkTab('Cobros y pagos');
  const filters = useQueryFilters({ desde: `${todayIso().slice(0, 7)}-01`, hasta: todayIso() });
  const { draft, set } = filters;
  const { desde, hasta } = filters.applied;
  const finance = useFinanceSummary(desde, hasta);
  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Imprimir informe',
            icon: Printer,
            shortcut: 'Ctrl+P',
            onClick: () => {
              window.print();
            },
          },
        ]}
      />
      <ScreenTitle
        title="Cobros y pagos"
        description="Informe del dinero que entró y salió en el periodo, y de lo que deben los clientes y se debe a proveedores a hoy."
      />
      <FilterBar onSubmit={filters.submit}>
        <FilterField label="Desde">
          <input
            type="date"
            value={draft.desde}
            onChange={(event) => {
              set('desde', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
        <FilterField label="Hasta">
          <input
            type="date"
            value={draft.hasta}
            max={todayIso()}
            onChange={(event) => {
              set('hasta', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
      </FilterBar>
      <QueryView query={finance}>
        {(summary) => (
          <div
            className={cn('transition-opacity', finance.isPlaceholderData && 'opacity-60')}
            aria-busy={finance.isPlaceholderData}
          >
            <FinanceReport summary={summary} />
          </div>
        )}
      </QueryView>
    </>
  );
}

function ReportBlock({
  title,
  note,
  children,
}: {
  title: string;
  note?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-line bg-surface break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-3 pb-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
        {note ? <p className="text-[12px] text-ink-3">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function documentsOf(report: AgingReport): number {
  return report.buckets.reduce((sum, bucket) => sum + bucket.documents, 0);
}

function FinanceReport({ summary }: { summary: FinanceSummary }) {
  const { receivables, payables, totals, movements } = summary;
  const collections = movements.filter((movement) => movement.direction === 'IN').length;
  const payments = movements.length - collections;

  const summaryRows = [
    {
      key: 'in',
      concept: 'Cobrado a clientes (recibos de caja)',
      documents: collections,
      value: totals.collected,
    },
    {
      key: 'out',
      concept: 'Pagado a proveedores (comprobantes de egreso)',
      documents: payments,
      value: totals.paid,
    },
  ];
  const balanceRows = [
    {
      key: 'receivables',
      concept: 'Cartera (por cobrar)',
      documents: documentsOf(receivables),
      total: receivables.total,
      overdue: receivables.overdue,
    },
    {
      key: 'payables',
      concept: 'Cuentas por pagar',
      documents: documentsOf(payables),
      total: payables.total,
      overdue: payables.overdue,
    },
  ];

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-[8px] border border-line bg-surface px-5 py-3 text-[13px] print:hidden">
        <p className="font-semibold text-ink">NOW CLEANY S.A.S. · Informe de cobros y pagos</p>
        <p className="text-ink-2">
          Periodo del {formatDate(summary.period.from)} al {formatDate(summary.period.to)} · saldos
          a hoy · generado el {new Date(summary.generatedAt).toLocaleString('es-CO')}
        </p>
      </div>
      <p className="hidden text-[12px] print:block">
        Periodo del {formatDate(summary.period.from)} al {formatDate(summary.period.to)} · saldos a
        hoy.
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ReportBlock title="Resumen del periodo">
          <DocTable
            label="Resumen del periodo"
            minWidth={360}
            rows={summaryRows}
            rowKey={(row) => row.key}
            columns={[
              {
                key: 'concept',
                header: 'Concepto',
                render: (row) => row.concept,
                total: 'Neto (cobrado menos pagado)',
              },
              {
                key: 'documents',
                header: 'Movimientos',
                align: 'right',
                render: (row) => row.documents,
                total: collections + payments,
              },
              {
                key: 'value',
                header: 'Valor',
                align: 'right',
                render: (row) => <Money value={row.value} />,
                total: (
                  <span className={totals.net.startsWith('-') ? 'text-critical' : undefined}>
                    <Money value={totals.net} strong />
                  </span>
                ),
              },
            ]}
          />
        </ReportBlock>
        <ReportBlock title="Saldos a hoy">
          <DocTable
            label="Saldos a hoy"
            minWidth={360}
            rows={balanceRows}
            rowKey={(row) => row.key}
            columns={[
              { key: 'concept', header: 'Concepto', render: (row) => row.concept },
              {
                key: 'documents',
                header: 'Documentos',
                align: 'right',
                render: (row) => row.documents,
              },
              {
                key: 'total',
                header: 'Saldo',
                align: 'right',
                render: (row) => <Money value={row.total} strong />,
              },
              {
                key: 'overdue',
                header: 'Vencido',
                align: 'right',
                render: (row) => (
                  <span className={row.overdue === '0' ? 'text-ink-3' : 'text-critical'}>
                    <Money value={row.overdue} />
                  </span>
                ),
              },
            ]}
          />
        </ReportBlock>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AgingBlock title="Cartera por antigüedad" report={receivables} />
        <AgingBlock title="Cuentas por pagar por antigüedad" report={payables} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PartiesBlock title="Clientes con mayor saldo" partyLabel="Cliente" report={receivables} />
        <PartiesBlock
          title="Proveedores con mayor saldo"
          partyLabel="Proveedor"
          report={payables}
        />
      </div>

      <MonthsTable months={summary.months} />

      <MovementsGrid movements={movements} />

      <MonthsCharts months={summary.months} />
    </div>
  );
}

function AgingBlock({ title, report }: { title: string; report: AgingReport }) {
  const total = BigInt(report.total);
  const rows = AGING_BUCKETS.map((bucket) => {
    const row = report.buckets.find((item) => item.bucket === bucket.key);
    return {
      key: bucket.key,
      label: bucket.long,
      documents: row?.documents ?? 0,
      amount: row?.amount ?? '0',
    };
  });
  const columns: DocColumn<(typeof rows)[number]>[] = [
    { key: 'label', header: 'Antigüedad', render: (row) => row.label },
    {
      key: 'documents',
      header: 'Documentos',
      align: 'right',
      render: (row) => row.documents,
      total: rows.reduce((sum, row) => sum + row.documents, 0),
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (row) => <Money value={row.amount} />,
      total: <Money value={report.total} strong />,
    },
    {
      key: 'share',
      header: '%',
      align: 'right',
      className: 'text-ink-2',
      render: (row) =>
        total > 0n ? `${String(Math.round((Number(row.amount) / Number(total)) * 100))} %` : '—',
      total: total > 0n ? '100 %' : '—',
    },
  ];
  return (
    <ReportBlock title={title}>
      <DocTable
        label={title}
        minWidth={360}
        rows={rows}
        rowKey={(row) => row.key}
        columns={columns}
      />
    </ReportBlock>
  );
}

function PartiesBlock({
  title,
  partyLabel,
  report,
}: {
  title: string;
  partyLabel: string;
  report: AgingReport;
}) {
  const rows = [...report.parties]
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 10);
  return (
    <ReportBlock title={title} note={report.parties.length > 10 ? 'Los 10 mayores' : undefined}>
      <DocTable
        label={title}
        minWidth={360}
        rows={rows}
        rowKey={(row) => row.id}
        empty="Sin saldos pendientes."
        columns={[
          { key: 'name', header: partyLabel, render: (row) => row.name },
          {
            key: 'documents',
            header: 'Docs.',
            align: 'right',
            render: (row) => row.documents,
          },
          {
            key: 'balance',
            header: 'Saldo',
            align: 'right',
            render: (row) => <Money value={row.balance} strong />,
            total: <Money value={sumPesos(rows.map((row) => row.balance))} strong />,
          },
          {
            key: 'overdue',
            header: 'Vencido',
            align: 'right',
            render: (row) => (
              <span className={row.overdue === '0' ? 'text-ink-3' : 'text-critical'}>
                <Money value={row.overdue} />
              </span>
            ),
            total: <Money value={sumPesos(rows.map((row) => row.overdue))} />,
          },
        ]}
      />
    </ReportBlock>
  );
}

function MonthsTable({ months }: { months: FinanceSummary['months'] }) {
  const sum = (key: 'invoiced' | 'collected' | 'bought' | 'paid') =>
    sumPesos(months.map((month) => month[key]));
  return (
    <ReportBlock title="Movimiento de los últimos 6 meses">
      <DocTable
        label="Movimiento por mes"
        rows={months}
        rowKey={(row) => row.month}
        columns={[
          {
            key: 'month',
            header: 'Mes',
            className: 'first-letter:uppercase',
            render: (row) => monthLabel(row.month),
          },
          {
            key: 'invoiced',
            header: 'Facturado',
            align: 'right',
            render: (row) => <Money value={row.invoiced} />,
            total: <Money value={sum('invoiced')} />,
          },
          {
            key: 'collected',
            header: 'Cobrado',
            align: 'right',
            render: (row) => <Money value={row.collected} />,
            total: <Money value={sum('collected')} />,
          },
          {
            key: 'bought',
            header: 'Comprado',
            align: 'right',
            render: (row) => <Money value={row.bought} />,
            total: <Money value={sum('bought')} />,
          },
          {
            key: 'paid',
            header: 'Pagado',
            align: 'right',
            render: (row) => <Money value={row.paid} />,
            total: <Money value={sum('paid')} />,
          },
        ]}
      />
    </ReportBlock>
  );
}

function MovementsGrid({ movements }: { movements: FinanceSummary['movements'] }) {
  const rows = useMemo<Movement[]>(
    () =>
      movements.map((movement, index) => ({
        ...movement,
        key: `${movement.date}-${String(index)}`,
      })),
    [movements],
  );
  const inOf = (row: Movement) => (row.direction === 'IN' ? row.amount : '0');
  const outOf = (row: Movement) => (row.direction === 'OUT' ? row.amount : '0');
  const columns: QueryColumn<Movement>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span>,
      sort: (row) => row.date,
      csv: (row) => row.date,
    },
    {
      key: 'kind',
      header: 'Documento',
      render: (row) => (row.direction === 'IN' ? 'Recibo de caja' : 'Comprobante de egreso'),
      sort: (row) => row.direction,
      csv: (row) => (row.direction === 'IN' ? 'Recibo de caja' : 'Comprobante de egreso'),
    },
    {
      key: 'party',
      header: 'Tercero',
      render: (row) => row.party,
      sort: (row) => row.party,
      csv: (row) => row.party,
    },
    {
      key: 'document',
      header: 'Factura',
      className: 'whitespace-nowrap',
      render: (row) => row.document,
      csv: (row) => row.document,
    },
    {
      key: 'method',
      header: 'Medio',
      hideOnMobile: true,
      render: (row) => row.method,
      csv: (row) => row.method,
    },
    {
      key: 'reference',
      header: 'Referencia',
      hideOnMobile: true,
      render: (row) => row.reference ?? <span className="text-ink-3">—</span>,
      csv: (row) => row.reference ?? '',
    },
    {
      key: 'in',
      header: 'Entradas',
      align: 'right',
      render: (row) => (row.direction === 'IN' ? <Money value={row.amount} /> : null),
      sort: (row) => Number(inOf(row)),
      csv: inOf,
      total: (list) => <Money value={sumPesos(list.map(inOf))} strong />,
    },
    {
      key: 'out',
      header: 'Salidas',
      align: 'right',
      render: (row) => (row.direction === 'OUT' ? <Money value={row.amount} /> : null),
      sort: (row) => Number(outOf(row)),
      csv: outOf,
      total: (list) => <Money value={sumPesos(list.map(outOf))} strong />,
    },
    {
      key: 'recordedBy',
      header: 'Registró',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-2">{row.recordedBy}</span>,
      csv: (row) => row.recordedBy,
    },
  ];
  return (
    <div>
      <GridTitle>Movimientos del periodo</GridTitle>
      <QueryGrid
        title="Movimientos de cobros y pagos"
        exportName="cobros-y-pagos"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        initialSort={{ key: 'date', direction: 'desc' }}
        empty="Sin recibos de caja ni comprobantes de egreso en este periodo."
      />
    </div>
  );
}

/** The charts accompany the tables (same scale in pesos, to compare sales with purchases). */
function MonthsCharts({ months }: { months: FinanceSummary['months'] }) {
  const data = months.map((month) => ({
    key: month.month,
    label: new Date(`${month.month}-15T12:00:00Z`)
      .toLocaleDateString('es-CO', { month: 'short', timeZone: 'UTC' })
      .replace('.', ''),
    title: monthLabel(month.month),
    values: {
      invoiced: Number(month.invoiced),
      collected: Number(month.collected),
      bought: Number(month.bought),
      paid: Number(month.paid),
    },
  }));
  const max = niceMax(Math.max(...data.flatMap((month) => Object.values(month.values)), 0));
  const total = (key: keyof (typeof data)[number]['values']) =>
    data.reduce((sum, month) => sum + month.values[key], 0);

  return (
    <ReportBlock
      title="Gráficas de los últimos 6 meses"
      note="Las dos gráficas usan la misma escala en pesos"
    >
      <div className="grid gap-8 px-5 pb-5 md:grid-cols-2">
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink-2">Ventas: facturado y cobrado</h3>
            <Legend
              series={SALES_SERIES}
              counts={{ invoiced: short(total('invoiced')), collected: short(total('collected')) }}
            />
          </div>
          <GroupedColumns
            label="Facturado y cobrado por mes"
            data={data}
            series={SALES_SERIES}
            max={max}
            format={pesos}
            axis={short}
          />
        </section>
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink-2">Compras: comprado y pagado</h3>
            <Legend
              series={PURCHASE_SERIES}
              counts={{ bought: short(total('bought')), paid: short(total('paid')) }}
            />
          </div>
          <GroupedColumns
            label="Comprado y pagado por mes"
            data={data}
            series={PURCHASE_SERIES}
            max={max}
            format={pesos}
            axis={short}
          />
        </section>
      </div>
    </ReportBlock>
  );
}
