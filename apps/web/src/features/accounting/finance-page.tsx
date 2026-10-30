import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Clock,
  HandCoins,
  Landmark,
  Receipt,
  Scale,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useInvoices, useSupplierInvoices } from '../../api/hooks';
import type { AgingReport, FinanceSummary, Invoice, SupplierInvoice } from '../../api/types';
import { useSession } from '../../auth/session';
import { type Datum, Legend, type Series, StackedBars } from '../../components/charts';
import { type Column, DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { EntityLink } from '../../components/links';
import { Chip, CollectionChip, DueDate } from '../../components/status';
import {
  Button,
  cn,
  EmptyState,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
} from '../../components/ui';
import {
  formatCop,
  formatCopShort,
  formatDate,
  monthLabel,
  plural,
  todayIso,
} from '../../lib/format';
import { PaymentDialog, type PaymentTarget } from '../billing/payment-dialog';
import { GroupedColumns, niceMax } from './grouped-columns';

type Period = 'month' | 'previous' | 'quarter';
type Tab = 'movements' | 'receivables' | 'payables';
type Direction = 'all' | 'IN' | 'OUT';
type Movement = FinanceSummary['movements'][number];

const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'month', label: 'Este mes' },
  { value: 'previous', label: 'Mes anterior' },
  { value: 'quarter', label: 'Últimos 90 días' },
];

function periodRange(period: Period): { from: string; to: string } {
  const today = todayIso();
  if (period === 'quarter') return { from: todayIso(-89), to: today };
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  const [year = 2026, month = 1] = today.split('-').map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    from: iso(new Date(Date.UTC(year, month - 2, 1))),
    to: iso(new Date(Date.UTC(year, month - 1, 0))),
  };
}

/** The summary of a period, keeping the previous one on screen while the next loads. */
function useFinanceSummary(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ['finance', range],
    queryFn: () => api.get<FinanceSummary>(`/v1/finance/summary?from=${range.from}&to=${range.to}`),
    placeholderData: keepPreviousData,
  });
}

const pesos = (value: number) => formatCop(String(Math.round(value)));
const short = (value: number) => formatCopShort(String(Math.round(value)));

const Money = ({ value }: { value: string }) => (
  <span title={formatCop(value)}>{formatCopShort(value)}</span>
);

/** Not due yet vs overdue: the same two colors in every debt chart. */
const DEBT_SERIES: Series[] = [
  { key: 'current', label: 'Al día', fill: 'bg-series-1' },
  { key: 'overdue', label: 'Vencido', fill: 'bg-series-2' },
];

const BUCKET_LABELS: Partial<Record<string, string>> = {
  CURRENT: 'Al día',
  D1_30: '1 a 30 días',
  D31_60: '31 a 60 días',
  D60_PLUS: 'Más de 60 días',
};

const SALES_SERIES: Series[] = [
  { key: 'invoiced', label: 'Facturado', fill: 'bg-series-1' },
  { key: 'collected', label: 'Cobrado', fill: 'bg-series-2' },
];

const PURCHASE_SERIES: Series[] = [
  { key: 'bought', label: 'Comprado', fill: 'bg-series-1' },
  { key: 'paid', label: 'Pagado', fill: 'bg-series-2' },
];

export function FinancePage() {
  const [period, setPeriod] = useState<Period>('month');
  const range = periodRange(period);
  const finance = useFinanceSummary(range);
  return (
    <>
      <PageHeader
        title="Cobros y pagos"
        description="Lo que deben los clientes, lo que se debe a proveedores y el dinero que entró y salió."
        actions={
          <Segmented label="Periodo" value={period} options={PERIODS} onChange={setPeriod} />
        }
      />
      <QueryView query={finance}>
        {(summary) => (
          <div
            className={cn('transition-opacity', finance.isPlaceholderData && 'opacity-60')}
            aria-busy={finance.isPlaceholderData}
          >
            <FinanceBoard summary={summary} />
          </div>
        )}
      </QueryView>
    </>
  );
}

function FinanceBoard({ summary }: { summary: FinanceSummary }) {
  const { can } = useSession();
  const canPay = can('payments:write');
  const [tab, setTab] = useState<Tab>('movements');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [target, setTarget] = useState<PaymentTarget | null>(null);

  const { receivables, payables, totals, movements } = summary;
  const openInvoices = documentsOf(receivables);
  const openSupplierInvoices = documentsOf(payables);
  const collections = movements.filter((movement) => movement.direction === 'IN').length;
  const payments = movements.length - collections;
  const overdueShare =
    Number(receivables.total) > 0 ? Number(receivables.overdue) / Number(receivables.total) : 0;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'movements', label: `Movimientos (${String(movements.length)})` },
    { value: 'receivables', label: `Por cobrar (${String(openInvoices)})` },
    { value: 'payables', label: `Por pagar (${String(openSupplierInvoices)})` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-2 text-[13px] text-ink-3">
        Movimientos del {formatDate(summary.period.from)} al {formatDate(summary.period.to)} ·
        saldos por cobrar y por pagar a hoy.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Por cobrar"
          value={<Money value={receivables.total} />}
          icon={Wallet}
          tone="brand"
          hint={plural(openInvoices, 'factura abierta', 'facturas abiertas')}
        />
        <Kpi
          label="Vencido por cobrar"
          value={<Money value={receivables.overdue} />}
          icon={TriangleAlert}
          tone={Number(receivables.overdue) > 0 ? 'critical' : 'good'}
          hint={
            Number(receivables.overdue) > 0
              ? `${String(Math.round(overdueShare * 100))} % de lo que deben`
              : 'Nada vencido'
          }
        />
        <Kpi
          label="Por pagar"
          value={<Money value={payables.total} />}
          icon={Landmark}
          hint={
            Number(payables.overdue) > 0
              ? `${formatCopShort(payables.overdue)} vencido`
              : plural(openSupplierInvoices, 'factura de proveedor', 'facturas de proveedor')
          }
        />
        <Kpi
          label="Cobrado en el periodo"
          value={<Money value={totals.collected} />}
          icon={ArrowDownLeft}
          hint={plural(collections, 'cobro', 'cobros')}
        />
        <Kpi
          label="Pagado en el periodo"
          value={<Money value={totals.paid} />}
          icon={ArrowUpRight}
          hint={plural(payments, 'pago', 'pagos')}
        />
        <Kpi
          label="Neto del periodo"
          value={<Money value={totals.net} />}
          icon={Scale}
          tone={totals.net.startsWith('-') ? 'critical' : 'good'}
          hint="Cobrado menos pagado"
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <DebtPanel
          title="Por cobrar"
          report={receivables}
          noun="factura"
          nouns="facturas"
          partiesTitle="Clientes que más deben"
          selected={customerId}
          onSelect={(id) => {
            setCustomerId(id);
            if (id) setTab('receivables');
          }}
        />
        <DebtPanel
          title="Por pagar"
          report={payables}
          noun="factura"
          nouns="facturas"
          partiesTitle="Proveedores a quienes más se debe"
          selected={supplierId}
          onSelect={(id) => {
            setSupplierId(id);
            if (id) setTab('payables');
          }}
        />
      </div>

      <MonthsPanel months={summary.months} />

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="overflow-x-auto">
            <Segmented label="Vista" value={tab} options={tabs} onChange={setTab} />
          </div>
          {tab === 'receivables' && customerId ? (
            <FilterChip
              label={
                receivables.parties.find((party) => party.id === customerId)?.name ?? 'Cliente'
              }
              onClear={() => {
                setCustomerId(null);
              }}
            />
          ) : null}
          {tab === 'payables' && supplierId ? (
            <FilterChip
              label={payables.parties.find((party) => party.id === supplierId)?.name ?? 'Proveedor'}
              onClear={() => {
                setSupplierId(null);
              }}
            />
          ) : null}
        </div>
        {tab === 'movements' ? <MovementsTable movements={movements} /> : null}
        {tab === 'receivables' ? (
          <ReceivablesTable customerId={customerId} canPay={canPay} onPay={setTarget} />
        ) : null}
        {tab === 'payables' ? (
          <PayablesTable supplierId={supplierId} canPay={canPay} onPay={setTarget} />
        ) : null}
      </Panel>

      <PaymentDialog
        target={target}
        onClose={() => {
          setTarget(null);
        }}
      />
    </div>
  );
}

function documentsOf(report: AgingReport): number {
  return report.buckets.reduce((sum, bucket) => sum + bucket.documents, 0);
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-brand-soft py-1 pr-1 pl-3 text-[13px] text-ink sm:self-auto">
      <span className="truncate">Solo {label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Quitar filtro"
        className="rounded-full p-0.5 text-ink-2 hover:bg-surface hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

// --- debts ----------------------------------------------------------------------------------------

function DebtPanel({
  title,
  report,
  noun,
  nouns,
  partiesTitle,
  selected,
  onSelect,
}: {
  title: string;
  report: AgingReport;
  noun: string;
  nouns: string;
  partiesTitle: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const buckets: Datum[] = report.buckets.map((bucket) => ({
    key: bucket.bucket,
    label: BUCKET_LABELS[bucket.bucket] ?? bucket.label,
    sub: plural(bucket.documents, noun, nouns),
    values:
      bucket.bucket === 'CURRENT'
        ? { current: Number(bucket.amount) }
        : { overdue: Number(bucket.amount) },
  }));
  const parties: Datum[] = [...report.parties]
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 6)
    .map((party) => ({
      key: party.id,
      label: party.name,
      sub: plural(party.documents, noun, nouns),
      values: {
        current: Number(party.balance) - Number(party.overdue),
        overdue: Number(party.overdue),
      },
    }));
  const empty = Number(report.total) <= 0;

  return (
    <Panel
      title={title}
      description={
        empty ? (
          'Sin saldos pendientes.'
        ) : (
          <>
            {formatCop(report.total)} en total · {formatCop(report.overdue)} vencido
          </>
        )
      }
    >
      {empty ? (
        <EmptyState icon={<Receipt />} title="Todo está al día" />
      ) : (
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink-2">Antigüedad</h3>
            <StackedBars
              label={`Antigüedad: ${title}`}
              data={buckets}
              series={DEBT_SERIES}
              unit={(value) => pesos(value)}
              aside={(datum) => short(Object.values(datum.values).reduce((a, b) => a + b, 0))}
            />
          </section>
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink-2">{partiesTitle}</h3>
            <StackedBars
              label={partiesTitle}
              data={parties}
              series={DEBT_SERIES}
              selected={selected}
              onSelect={onSelect}
              unit={(value) => pesos(value)}
              aside={(datum) =>
                short((datum.values['current'] ?? 0) + (datum.values['overdue'] ?? 0))
              }
            />
            <p className="mt-1.5 px-2 text-[12px] text-ink-3">
              Toca una barra para ver solo sus facturas abajo.
            </p>
          </section>
          <Legend series={DEBT_SERIES} />
        </div>
      )}
    </Panel>
  );
}

// --- six months -------------------------------------------------------------------------------------

function MonthsPanel({ months }: { months: FinanceSummary['months'] }) {
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
    <Panel
      title="Últimos 6 meses"
      description="Las dos gráficas usan la misma escala en pesos, para comparar ventas con compras."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-semibold">Ventas: facturado y cobrado</h3>
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
            <h3 className="text-sm font-semibold">Compras: comprado y pagado</h3>
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
    </Panel>
  );
}

// --- tables -----------------------------------------------------------------------------------------

const FIRST_ROWS = 25;

function MovementsTable({ movements }: { movements: Movement[] }) {
  const [direction, setDirection] = useState<Direction>('all');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () =>
      movements
        .map((movement, index) => ({ ...movement, key: `${movement.date}-${String(index)}` }))
        .filter((movement) => direction === 'all' || movement.direction === direction),
    [movements, direction],
  );
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);
  const sumOf = (dir: 'IN' | 'OUT') =>
    rows
      .filter((movement) => movement.direction === dir)
      .reduce((sum, movement) => sum + BigInt(movement.amount), 0n);
  const income = sumOf('IN');
  const outcome = sumOf('OUT');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <Segmented
          label="Tipo de movimiento"
          value={direction}
          onChange={(value) => {
            setDirection(value);
            setShowAll(false);
          }}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'IN', label: 'Entradas' },
            { value: 'OUT', label: 'Salidas' },
          ]}
        />
        <p className="text-[13px] text-ink-2 tabular-nums">
          Entradas <span className="font-semibold text-ink">{formatCop(income.toString())}</span> ·
          Salidas <span className="font-semibold text-ink">{formatCop(outcome.toString())}</span>
        </p>
      </div>
      <DataTable
        label="Movimientos del periodo"
        rows={shown}
        rowKey={(row) => row.key}
        empty={
          <EmptyState
            icon={<Banknote />}
            title="Sin movimientos en este periodo"
            description="Aquí aparecen los cobros a clientes y los pagos a proveedores registrados."
          />
        }
        columns={[
          {
            key: 'date',
            header: 'Fecha',
            render: (row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span>,
          },
          {
            key: 'direction',
            header: 'Tipo',
            render: (row) =>
              row.direction === 'IN' ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <ArrowDownLeft aria-hidden className="size-3.5 text-ink-3" strokeWidth={2.25} />
                  Entrada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <ArrowUpRight aria-hidden className="size-3.5 text-ink-3" strokeWidth={2.25} />
                  Salida
                </span>
              ),
          },
          { key: 'party', header: 'Tercero', render: (row) => row.party },
          {
            key: 'document',
            header: 'Documento',
            render: (row) => <span className="whitespace-nowrap">{row.document}</span>,
          },
          { key: 'method', header: 'Medio', render: (row) => row.method },
          {
            key: 'reference',
            header: 'Referencia',
            hideOnMobile: true,
            render: (row) => row.reference ?? <span className="text-ink-3">—</span>,
          },
          {
            key: 'amount',
            header: 'Valor',
            align: 'right',
            render: (row) => (
              <span className={cn('whitespace-nowrap', row.direction === 'IN' && 'font-semibold')}>
                {row.direction === 'IN' ? '+ ' : '− '}
                {formatCop(row.amount)}
              </span>
            ),
          },
          {
            key: 'recordedBy',
            header: 'Registró',
            hideOnMobile: true,
            render: (row) => <span className="text-ink-2">{row.recordedBy}</span>,
          },
        ]}
      />
      {rows.length > FIRST_ROWS ? (
        <div className="border-t border-line px-4 py-2.5 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowAll((value) => !value);
            }}
          >
            {showAll ? 'Mostrar menos' : `Mostrar los ${String(rows.length)} movimientos`}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ReceivablesTable({
  customerId,
  canPay,
  onPay,
}: {
  customerId: string | null;
  canPay: boolean;
  onPay: (target: PaymentTarget) => void;
}) {
  const invoices = useInvoices({ open: true, limit: '1000' });
  const actionColumn: Column<Invoice> = {
    key: 'action',
    header: 'Acción',
    align: 'right',
    render: (invoice) => (
      <Button
        size="sm"
        variant="secondary"
        icon={<HandCoins className="size-3.5" />}
        onClick={() => {
          onPay({
            kind: 'invoice',
            id: invoice.id,
            label: invoice.label,
            party: invoice.customer.name,
            balance: invoice.balance,
            dueDate: invoice.dueDate,
          });
        }}
      >
        Registrar cobro
      </Button>
    ),
  };
  return (
    <QueryView query={invoices}>
      {(all) => {
        const rows = all
          .filter((invoice) => !customerId || invoice.customer.id === customerId)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return (
          <DataTable<Invoice>
            label="Facturas por cobrar"
            rows={rows}
            rowKey={(invoice) => invoice.id}
            empty={
              <EmptyState
                icon={<Wallet />}
                title="No hay facturas por cobrar"
                description="Todas las facturas de venta están pagadas."
              />
            }
            columns={[
              {
                key: 'label',
                header: 'Factura',
                render: (invoice) => (
                  <EntityLink to="invoice" id={invoice.id} className="font-semibold">
                    {invoice.label}
                  </EntityLink>
                ),
              },
              {
                key: 'customer',
                header: 'Cliente',
                render: (invoice) => (
                  <EntityLink to="customer" id={invoice.customer.id}>
                    {invoice.customer.name}
                  </EntityLink>
                ),
              },
              {
                key: 'due',
                header: 'Vence',
                render: (invoice) => <DueDate date={invoice.dueDate} lateLabel="Vencida" />,
              },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                hideOnMobile: true,
                render: (invoice) => (
                  <span className="whitespace-nowrap">{formatCop(invoice.total)}</span>
                ),
              },
              {
                key: 'balance',
                header: 'Saldo',
                align: 'right',
                render: (invoice) => (
                  <span className="font-semibold whitespace-nowrap">
                    {formatCop(invoice.balance)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (invoice) => <CollectionChip status={invoice.status} />,
              },
              ...(canPay ? [actionColumn] : []),
            ]}
          />
        );
      }}
    </QueryView>
  );
}

function SupplierInvoiceChip({ invoice }: { invoice: SupplierInvoice }) {
  if (invoice.overdue) {
    return (
      <Chip tone="critical" icon={TriangleAlert}>
        Vencida
      </Chip>
    );
  }
  if (Number(invoice.paid) > 0) {
    return (
      <Chip tone="warning" icon={Banknote}>
        Abonada
      </Chip>
    );
  }
  return (
    <Chip tone="brand" icon={Clock}>
      Por pagar
    </Chip>
  );
}

function PayablesTable({
  supplierId,
  canPay,
  onPay,
}: {
  supplierId: string | null;
  canPay: boolean;
  onPay: (target: PaymentTarget) => void;
}) {
  const invoices = useSupplierInvoices({ open: true });
  const actionColumn: Column<SupplierInvoice> = {
    key: 'action',
    header: 'Acción',
    align: 'right',
    render: (invoice) => (
      <Button
        size="sm"
        variant="secondary"
        icon={<Banknote className="size-3.5" />}
        onClick={() => {
          onPay({
            kind: 'supplier-invoice',
            id: invoice.id,
            label: `Factura ${invoice.documentNumber}`,
            party: invoice.supplier.name,
            balance: invoice.balance,
            dueDate: invoice.dueDate,
          });
        }}
      >
        Registrar pago
      </Button>
    ),
  };
  return (
    <QueryView query={invoices}>
      {(all) => {
        const rows = all
          .filter((invoice) => !supplierId || invoice.supplier.id === supplierId)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return (
          <DataTable<SupplierInvoice>
            label="Facturas de proveedor por pagar"
            rows={rows}
            rowKey={(invoice) => invoice.id}
            empty={
              <EmptyState
                icon={<Landmark />}
                title="No hay facturas de proveedor por pagar"
                description="Recepción registra cada factura de proveedor al recibir la compra."
              />
            }
            columns={[
              {
                key: 'document',
                header: 'Factura',
                render: (invoice) => (
                  <span className="block">
                    <span className="font-semibold whitespace-nowrap">
                      N.º {invoice.documentNumber}
                    </span>
                    <span className="block text-[12.5px] font-normal text-ink-3">
                      <EntityLink to="purchase-order" id={invoice.purchaseOrder.id}>
                        {invoice.purchaseOrder.label}
                      </EntityLink>
                    </span>
                  </span>
                ),
              },
              { key: 'supplier', header: 'Proveedor', render: (invoice) => invoice.supplier.name },
              {
                key: 'date',
                header: 'Fecha',
                hideOnMobile: true,
                render: (invoice) => (
                  <span className="whitespace-nowrap">{formatDate(invoice.invoiceDate)}</span>
                ),
              },
              {
                key: 'due',
                header: 'Vence',
                render: (invoice) => <DueDate date={invoice.dueDate} lateLabel="Vencida" />,
              },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                hideOnMobile: true,
                render: (invoice) => (
                  <span className="whitespace-nowrap">{formatCop(invoice.total)}</span>
                ),
              },
              {
                key: 'balance',
                header: 'Saldo',
                align: 'right',
                render: (invoice) => (
                  <span className="font-semibold whitespace-nowrap">
                    {formatCop(invoice.balance)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (invoice) => <SupplierInvoiceChip invoice={invoice} />,
              },
              ...(canPay ? [actionColumn] : []),
            ]}
          />
        );
      }}
    </QueryView>
  );
}
