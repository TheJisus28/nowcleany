import { CircleDollarSign, Factory, FileText, Search, TriangleAlert, Wallet } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useInvoices } from '../../api/hooks';
import type { Invoice } from '../../api/types';
import { DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { EntityLink, pathTo } from '../../components/links';
import { CollectionChip, DueDate } from '../../components/status';
import { EmptyState, Input, PageHeader, Panel, QueryView, Segmented } from '../../components/ui';
import { formatCop, formatCopShort, formatDate, isZero, plural, todayIso } from '../../lib/format';
import { colombiaDay, normalizeText, sumPesos } from './billing-format';

type Filter = 'all' | 'open' | 'overdue' | 'paid';

const MATCHES: Record<Filter, (invoice: Invoice) => boolean> = {
  all: () => true,
  open: (invoice) => invoice.status !== 'PAID',
  overdue: (invoice) => invoice.status === 'OVERDUE',
  paid: (invoice) => invoice.status === 'PAID',
};

export function InvoicesPage() {
  const invoices = useInvoices({ limit: '1000' });
  return (
    <>
      <PageHeader
        title="Facturas"
        description="Las facturas de venta emitidas en el consolidado, con lo cobrado y lo que falta por cobrar."
      />
      <QueryView query={invoices}>{(rows) => <InvoicesBoard invoices={rows} />}</QueryView>
    </>
  );
}

function InvoicesBoard({ invoices }: { invoices: Invoice[] }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const query = normalizeText(useDeferredValue(search).trim());

  const sorted = useMemo(
    () => [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    [invoices],
  );
  const matching = useMemo(
    () =>
      query
        ? sorted.filter((invoice) =>
            normalizeText(
              [
                invoice.label,
                invoice.customer.name,
                invoice.customer.document,
                invoice.order.label,
                invoice.branchName,
                invoice.seller.name,
              ].join(' '),
            ).includes(query),
          )
        : sorted,
    [sorted, query],
  );
  const rows = matching.filter(MATCHES[filter]);
  const count = (key: Filter) => matching.filter(MATCHES[key]).length;

  const stats = useMemo(() => {
    const month = todayIso().slice(0, 7);
    const thisMonth = invoices.filter(
      (invoice) => colombiaDay(invoice.issuedAt).slice(0, 7) === month,
    );
    const open = invoices.filter(MATCHES.open);
    const overdue = invoices.filter(MATCHES.overdue);
    return {
      invoicedMonth: sumPesos(thisMonth.map((invoice) => invoice.total)).toString(),
      monthCount: thisMonth.length,
      receivable: sumPesos(open.map((invoice) => invoice.balance)).toString(),
      openCount: open.length,
      overdue: sumPesos(overdue.map((invoice) => invoice.balance)).toString(),
      overdueCount: overdue.length,
      withPending: invoices.filter((invoice) => invoice.hasPending && invoice.status !== 'PAID')
        .length,
    };
  }, [invoices]);

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: `Todas (${String(count('all'))})` },
    { value: 'open', label: `Por cobrar (${String(count('open'))})` },
    { value: 'overdue', label: `Vencidas (${String(count('overdue'))})` },
    { value: 'paid', label: `Pagadas (${String(count('paid'))})` },
  ];

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Facturado este mes"
          value={
            <span title={formatCop(stats.invoicedMonth)}>
              {formatCopShort(stats.invoicedMonth)}
            </span>
          }
          icon={FileText}
          tone="brand"
          hint={`${plural(stats.monthCount, 'factura', 'facturas')}, con IVA`}
        />
        <Kpi
          label="Por cobrar"
          value={
            <span title={formatCop(stats.receivable)}>{formatCopShort(stats.receivable)}</span>
          }
          icon={Wallet}
          hint={plural(stats.openCount, 'factura abierta', 'facturas abiertas')}
        />
        <Kpi
          label="Vencido"
          value={<span title={formatCop(stats.overdue)}>{formatCopShort(stats.overdue)}</span>}
          icon={TriangleAlert}
          tone={stats.overdueCount > 0 ? 'critical' : 'good'}
          hint={
            stats.overdueCount > 0
              ? plural(stats.overdueCount, 'factura vencida', 'facturas vencidas')
              : 'Nada vencido'
          }
        />
        <Kpi
          label="Con producto pendiente"
          value={stats.withPending}
          icon={Factory}
          tone={stats.withPending > 0 ? 'warning' : 'neutral'}
          hint="Facturadas antes de tener todo el producto"
        />
      </div>

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block lg:w-80">
            <span className="sr-only">Buscar factura</span>
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Número, cliente, NIT o preventa"
              className="pl-9"
            />
          </label>
          <div className="overflow-x-auto">
            <Segmented
              label="Estado de cobro"
              value={filter}
              options={filters}
              onChange={setFilter}
            />
          </div>
        </div>
        <DataTable<Invoice>
          label="Facturas"
          rows={rows}
          rowKey={(invoice) => invoice.id}
          onRowClick={(invoice) => {
            void navigate(pathTo('invoice', invoice.id));
          }}
          empty={
            <EmptyState
              icon={<CircleDollarSign />}
              title={
                invoices.length === 0
                  ? 'Aún no hay facturas'
                  : 'Ninguna factura coincide con la búsqueda'
              }
              description={
                invoices.length === 0
                  ? 'Las facturas se emiten desde el consolidado, al facturar las preventas.'
                  : 'Prueba con el número (FV-00012), parte del nombre o el documento.'
              }
            />
          }
          columns={[
            {
              key: 'label',
              header: 'Factura',
              render: (invoice) => (
                <span className="inline-flex items-center gap-2">
                  <EntityLink to="invoice" id={invoice.id} className="font-semibold">
                    {invoice.label}
                  </EntityLink>
                  {invoice.hasPending ? (
                    <span
                      title="Tiene producto pendiente por fabricar o comprar"
                      className="inline-flex"
                    >
                      <Factory
                        aria-label="Con producto pendiente"
                        className="size-3.5 text-[#b67d00]"
                        strokeWidth={2.25}
                      />
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'customer',
              header: 'Cliente',
              render: (invoice) => (
                <span className="block min-w-0">
                  <EntityLink to="customer" id={invoice.customer.id}>
                    {invoice.customer.name}
                  </EntityLink>
                  <span className="block text-[12.5px] text-ink-3">
                    {invoice.customer.document}
                  </span>
                </span>
              ),
            },
            {
              key: 'order',
              header: 'Preventa',
              hideOnMobile: true,
              render: (invoice) => (
                <EntityLink to="order" id={invoice.order.id}>
                  {invoice.order.label}
                </EntityLink>
              ),
            },
            {
              key: 'issued',
              header: 'Emitida',
              render: (invoice) => (
                <span className="whitespace-nowrap">
                  {formatDate(colombiaDay(invoice.issuedAt))}
                </span>
              ),
            },
            {
              key: 'due',
              header: 'Vence',
              render: (invoice) =>
                invoice.status === 'PAID' ? (
                  <span className="whitespace-nowrap text-ink-3">
                    {formatDate(invoice.dueDate)}
                  </span>
                ) : (
                  <DueDate date={invoice.dueDate} lateLabel="Vencida" />
                ),
            },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              render: (invoice) => (
                <span className="whitespace-nowrap">{formatCop(invoice.total)}</span>
              ),
            },
            {
              key: 'balance',
              header: 'Saldo',
              align: 'right',
              render: (invoice) =>
                isZero(invoice.balance) ? (
                  <span className="text-ink-3">$ 0</span>
                ) : (
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
          ]}
        />
        {rows.length > 0 ? (
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line bg-surface-2/50 px-4 py-2.5 text-[13px] text-ink-2">
            <span>{plural(rows.length, 'factura', 'facturas')}</span>
            <span className="tabular-nums">
              Total{' '}
              <span className="font-semibold text-ink">
                {formatCop(sumPesos(rows.map((invoice) => invoice.total)).toString())}
              </span>{' '}
              · Saldo{' '}
              <span className="font-semibold text-ink">
                {formatCop(sumPesos(rows.map((invoice) => invoice.balance)).toString())}
              </span>
            </span>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
