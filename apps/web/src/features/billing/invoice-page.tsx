import { Factory, HandCoins, Printer } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useParams } from 'react-router';
import { useInvoice, useInvoices } from '../../api/hooks';
import type { Invoice } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { CollectionChip, DueDate } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatCop, formatDate, formatDateTime, isZero, unitLabel } from '../../lib/format';
import { Num } from '../sales/order-shared';
import { colombiaDay, sumPesos } from './billing-format';
import { type DocColumn, DocTable, Money, StatusLine } from './erp-kit';

type InvoiceLine = Invoice['lines'][number];
type Payment = NonNullable<Invoice['payments']>[number];

export function InvoicePage() {
  const { id } = useParams();
  const invoice = useInvoice(id);
  return <QueryView query={invoice}>{(data) => <InvoiceDocument invoice={data} />}</QueryView>;
}

function Value({ children }: { children: ReactNode }) {
  return <span className="block py-1">{children}</span>;
}

/** Previous / next invoice by number among the ones the user can see. */
function useInvoiceNeighbors(invoice: Invoice) {
  const invoices = useInvoices({ limit: '2000' });
  return useMemo(() => {
    let previous: Invoice | null = null;
    let next: Invoice | null = null;
    for (const item of invoices.data ?? []) {
      if (item.label < invoice.label && (!previous || item.label > previous.label)) previous = item;
      if (item.label > invoice.label && (!next || item.label < next.label)) next = item;
    }
    return {
      previous: previous ? pathTo('invoice', previous.id) : null,
      next: next ? pathTo('invoice', next.id) : null,
    };
  }, [invoices.data, invoice.label]);
}

/** "Factura de venta" as a printable document, with the cash receipts applied to it. */
function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const { can } = useSession();
  const { has } = useAccess();
  const neighbors = useInvoiceNeighbors(invoice);
  useWorkTab(`${invoice.label} · ${invoice.customer.name}`);

  const payments = invoice.payments ?? [];
  const canCollect = can('payments:write') && has('receipts') && !isZero(invoice.balance);

  const columns: DocColumn<InvoiceLine>[] = [
    {
      key: 'n',
      header: '#',
      align: 'center',
      className: 'w-10 text-ink-3 tabular-nums',
      render: (_, index) => index + 1,
    },
    {
      key: 'code',
      header: 'Código',
      className: 'tabular-nums',
      render: (line) => (
        <EntityLink to="product" id={line.productId}>
          {line.productCode}
        </EntityLink>
      ),
    },
    { key: 'name', header: 'Descripción', render: (line) => line.productName },
    {
      key: 'unit',
      header: 'Und',
      className: 'text-ink-2',
      render: (line) => unitLabel(line.quantity.unit),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      align: 'right',
      render: (line) => <Num value={line.quantity} strong />,
    },
    {
      key: 'stock',
      header: 'Del stock',
      align: 'right',
      render: (line) => <Num value={line.fromStock} />,
    },
    {
      key: 'pending',
      header: 'Pendiente',
      align: 'right',
      render: (line) =>
        isZero(line.pending.quantity) ? (
          <Num value={line.pending} />
        ) : (
          <span className="inline-flex items-center gap-1" title="Por fabricar o comprar">
            <Factory aria-hidden className="size-3.5 text-[#b67d00]" strokeWidth={2.25} />
            <Num value={line.pending} strong />
          </span>
        ),
    },
    {
      key: 'price',
      header: 'Precio',
      align: 'right',
      render: (line) => formatCop(line.unitPrice),
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (line) => <span className="font-medium">{formatCop(line.amount)}</span>,
    },
  ];

  const paymentColumns: DocColumn<Payment>[] = [
    {
      key: 'date',
      header: 'Fecha',
      className: 'whitespace-nowrap',
      render: (payment) => formatDate(payment.paidOn),
    },
    { key: 'method', header: 'Medio de pago', render: (payment) => payment.methodLabel },
    {
      key: 'reference',
      header: 'Referencia',
      render: (payment) => payment.reference ?? <span className="text-ink-3">—</span>,
    },
    {
      key: 'by',
      header: 'Registró',
      className: 'text-ink-2',
      render: (payment) => payment.recordedBy,
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (payment) => <Money value={payment.amount} />,
      total: <Money value={sumPesos(payments.map((payment) => payment.amount))} strong />,
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Registrar recibo de caja',
            icon: HandCoins,
            shortcut: 'F9',
            primary: true,
            to: `/contabilidad/recibos?factura=${invoice.id}`,
            hidden: !canCollect,
          },
          {
            label: 'Imprimir',
            icon: Printer,
            shortcut: 'Ctrl+P',
            onClick: () => {
              window.print();
            },
          },
        ]}
        previous={neighbors.previous}
        next={neighbors.next}
        closeTo={has('invoices') ? '/facturas' : has('receivables') ? '/contabilidad/cartera' : '/'}
      />
      <DocumentScreen
        kind="Factura de venta"
        number={invoice.label}
        status={<CollectionChip status={invoice.status} />}
        notes={
          <div className="flex flex-col gap-1.5">
            <p>
              Pedido{' '}
              <EntityLink to="order" id={invoice.order.id} className="font-medium">
                {invoice.order.label}
              </EntityLink>
              . Precios de lista por unidad; IVA 19 %. Plazo de pago hasta el{' '}
              {formatDate(invoice.dueDate)}.
            </p>
          </div>
        }
        totals={[
          { label: 'Subtotal', value: formatCop(invoice.subtotal) },
          { label: 'IVA 19 %', value: formatCop(invoice.tax) },
          { label: 'Total factura', value: formatCop(invoice.total), strong: true },
          { label: 'Abonos', value: isZero(invoice.paid) ? '$ 0' : `− ${formatCop(invoice.paid)}` },
          {
            label: 'Saldo por cobrar',
            value: (
              <span className={invoice.status === 'OVERDUE' ? 'text-critical' : undefined}>
                {formatCop(invoice.balance)}
              </span>
            ),
            strong: true,
          },
        ]}
        signatures={[
          { label: 'Elaboró', name: invoice.issuedBy, at: formatDateTime(invoice.issuedAt) },
          { label: 'Vendedor', name: invoice.seller.name },
        ]}
      >
        {invoice.status === 'OVERDUE' ? (
          <StatusLine tone="warning">
            Vencida {invoice.agingLabel ? `(${invoice.agingLabel.toLowerCase()})` : ''}: saldo de{' '}
            {formatCop(invoice.balance)} por cobrar.
          </StatusLine>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Cliente" span={2}>
            <Value>
              <EntityLink to="customer" id={invoice.customer.id} className="font-medium">
                {invoice.customer.name}
              </EntityLink>
            </Value>
          </HeaderField>
          <HeaderField label="NIT / C.C.">
            <Value>
              <span className="tabular-nums">{invoice.customer.document}</span>
            </Value>
          </HeaderField>
          <HeaderField label="Sucursal">
            <Value>{invoice.branchName}</Value>
          </HeaderField>
          <HeaderField label="Fecha de factura">
            <Value>{formatDate(colombiaDay(invoice.issuedAt))}</Value>
          </HeaderField>
          <HeaderField label="Vence">
            <Value>
              {formatDate(invoice.dueDate)}
              {invoice.status !== 'PAID' ? (
                <span className="ml-1.5 text-[12.5px]">
                  <DueDate date={invoice.dueDate} lateLabel="Vencida" />
                </span>
              ) : null}
            </Value>
          </HeaderField>
          <HeaderField label="Vendedor">
            <Value>{invoice.seller.name}</Value>
          </HeaderField>
          <HeaderField label="Pedido">
            <Value>
              <EntityLink to="order" id={invoice.order.id}>
                {invoice.order.label}
              </EntityLink>
            </Value>
          </HeaderField>
        </HeaderGrid>
        <DocumentSection title="Detalle de la factura" flush>
          <DocTable
            label={`Líneas de ${invoice.label}`}
            columns={columns}
            rows={invoice.lines}
            rowKey={(line) => line.productId}
            minWidth={820}
          />
        </DocumentSection>
        <DocumentSection title="Recibos de caja aplicados" flush>
          <DocTable
            label={`Recibos aplicados a ${invoice.label}`}
            columns={paymentColumns}
            rows={payments}
            rowKey={(payment) => payment.id}
            empty={
              canCollect
                ? 'Sin recibos aplicados. Usa "Registrar recibo de caja" cuando el cliente pague.'
                : 'Sin recibos aplicados.'
            }
          />
        </DocumentSection>
      </DocumentScreen>
    </>
  );
}
