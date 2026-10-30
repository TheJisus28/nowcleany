import { Factory } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useInvoices } from '../../api/hooks';
import type { Invoice } from '../../api/types';
import {
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { CollectionChip, DueDate } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/format';
import { colombiaDay, normalizeText, sumPesos } from './billing-format';
import { FILTER_INPUT, Money, ScreenTitle, useQueryFilters } from './erp-kit';

const COLLECTION_FILTERS: readonly {
  value: string;
  label: string;
  matches: (invoice: Invoice) => boolean;
}[] = [
  { value: 'all', label: 'Todas', matches: () => true },
  { value: 'open', label: 'Por cobrar (con saldo)', matches: (i) => i.status !== 'PAID' },
  { value: 'overdue', label: 'Vencidas', matches: (i) => i.status === 'OVERDUE' },
  { value: 'partial', label: 'Abonadas', matches: (i) => i.status === 'PARTIAL' },
  { value: 'paid', label: 'Pagadas', matches: (i) => i.status === 'PAID' },
];

/** "Facturas de venta": consultation by date, customer and collection status, with totals. */
export function InvoicesPage() {
  const navigate = useNavigate();
  useWorkTab('Facturas de venta');
  const filters = useQueryFilters({
    desde: todayIso(-90),
    hasta: todayIso(),
    cliente: '',
    cobro: 'all',
    numero: '',
  });
  const { draft, set } = filters;
  const { desde, hasta, cliente, cobro, numero } = filters.applied;
  const invoices = useInvoices({ limit: '2000' });

  const rows = useMemo(() => {
    const customer = normalizeText(cliente.trim());
    const number = normalizeText(numero.trim());
    const matches =
      COLLECTION_FILTERS.find((item) => item.value === cobro)?.matches ?? (() => true);
    return (invoices.data ?? []).filter((invoice) => {
      const day = colombiaDay(invoice.issuedAt);
      return (
        (!desde || day >= desde) &&
        (!hasta || day <= hasta) &&
        matches(invoice) &&
        (!customer ||
          normalizeText(`${invoice.customer.name} ${invoice.customer.document}`).includes(
            customer,
          )) &&
        (!number || normalizeText(`${invoice.label} ${invoice.order.label}`).includes(number))
      );
    });
  }, [invoices.data, desde, hasta, cliente, cobro, numero]);

  const columns: QueryColumn<Invoice>[] = [
    {
      key: 'label',
      header: 'Factura',
      render: (invoice) => (
        <span className="inline-flex items-center gap-1.5">
          <EntityLink to="invoice" id={invoice.id} className="font-medium">
            {invoice.label}
          </EntityLink>
          {invoice.hasPending ? (
            <span title="Facturada con producto pendiente por fabricar o comprar">
              <Factory
                aria-label="Con producto pendiente"
                className="size-3.5 text-[#b67d00]"
                strokeWidth={2.25}
              />
            </span>
          ) : null}
        </span>
      ),
      sort: (invoice) => invoice.label,
      csv: (invoice) => invoice.label,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (invoice) => (
        <span className="whitespace-nowrap">{formatDate(colombiaDay(invoice.issuedAt))}</span>
      ),
      sort: (invoice) => invoice.issuedAt,
      csv: (invoice) => colombiaDay(invoice.issuedAt),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (invoice) => (
        <EntityLink to="customer" id={invoice.customer.id}>
          {invoice.customer.name}
        </EntityLink>
      ),
      sort: (invoice) => invoice.customer.name,
      csv: (invoice) => invoice.customer.name,
    },
    {
      key: 'document',
      header: 'NIT / C.C.',
      hideOnMobile: true,
      className: 'tabular-nums text-ink-2',
      render: (invoice) => invoice.customer.document,
      csv: (invoice) => invoice.customer.document,
    },
    {
      key: 'order',
      header: 'Pedido',
      hideOnMobile: true,
      render: (invoice) => (
        <EntityLink to="order" id={invoice.order.id}>
          {invoice.order.label}
        </EntityLink>
      ),
      csv: (invoice) => invoice.order.label,
    },
    {
      key: 'seller',
      header: 'Vendedor',
      hideOnMobile: true,
      render: (invoice) => invoice.seller.name,
      sort: (invoice) => invoice.seller.name,
      csv: (invoice) => invoice.seller.name,
    },
    {
      key: 'due',
      header: 'Vence',
      render: (invoice) =>
        invoice.status === 'PAID' ? (
          <span className="whitespace-nowrap text-ink-3">{formatDate(invoice.dueDate)}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {formatDate(invoice.dueDate)}
            <span className="text-[12px]">
              <DueDate date={invoice.dueDate} lateLabel="Vencida" />
            </span>
          </span>
        ),
      sort: (invoice) => invoice.dueDate,
      csv: (invoice) => invoice.dueDate,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (invoice) => <Money value={invoice.total} />,
      sort: (invoice) => Number(invoice.total),
      csv: (invoice) => invoice.total,
      total: (list) => <Money value={sumPesos(list.map((invoice) => invoice.total))} />,
    },
    {
      key: 'paid',
      header: 'Abonos',
      align: 'right',
      hideOnMobile: true,
      render: (invoice) => <Money value={invoice.paid} />,
      sort: (invoice) => Number(invoice.paid),
      csv: (invoice) => invoice.paid,
      total: (list) => <Money value={sumPesos(list.map((invoice) => invoice.paid))} />,
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (invoice) => <Money value={invoice.balance} strong={invoice.status !== 'PAID'} />,
      sort: (invoice) => Number(invoice.balance),
      csv: (invoice) => invoice.balance,
      total: (list) => <Money value={sumPesos(list.map((invoice) => invoice.balance))} strong />,
    },
    {
      key: 'status',
      header: 'Estado de cobro',
      render: (invoice) => <CollectionChip status={invoice.status} />,
      sort: (invoice) => invoice.statusLabel,
      csv: (invoice) => invoice.statusLabel,
    },
  ];

  return (
    <>
      <ScreenTitle
        title="Facturas de venta"
        description="Facturas emitidas en Facturación de pedidos, con lo abonado y el saldo por cobrar. Enter o doble clic abre la factura."
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
            onChange={(event) => {
              set('hasta', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
        <FilterField label="Cliente (nombre o NIT)">
          <input
            value={draft.cliente}
            onChange={(event) => {
              set('cliente', event.target.value);
            }}
            className={`${FILTER_INPUT} w-52`}
          />
        </FilterField>
        <FilterField label="Estado de cobro">
          <select
            value={draft.cobro}
            onChange={(event) => {
              set('cobro', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            {COLLECTION_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Número o pedido">
          <input
            value={draft.numero}
            placeholder="FV-00012"
            onChange={(event) => {
              set('numero', event.target.value);
            }}
            className={`${FILTER_INPUT} w-28`}
          />
        </FilterField>
      </FilterBar>
      <QueryView query={invoices}>
        {() => (
          <QueryGrid
            title="Facturas de venta"
            exportName="facturas-de-venta"
            columns={columns}
            rows={rows}
            rowKey={(invoice) => invoice.id}
            initialSort={{ key: 'label', direction: 'desc' }}
            onOpen={(invoice) => {
              void navigate(pathTo('invoice', invoice.id));
            }}
            empty="No hay facturas con estos filtros. Amplía el rango de fechas o cambia el estado de cobro."
          />
        )}
      </QueryView>
    </>
  );
}
