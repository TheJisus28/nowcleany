import { Factory, HandCoins, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useInvoice } from '../../api/hooks';
import type { Invoice } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { BackLink, EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, CollectionChip, DueDate } from '../../components/status';
import { Button, cn, EmptyState, PageHeader, Panel, QueryView } from '../../components/ui';
import { formatCop, formatDate, formatDateTime, isZero, plural, ratio } from '../../lib/format';
import { PaymentDialog } from './payment-dialog';

type InvoiceLine = Invoice['lines'][number];

export function InvoicePage() {
  const { id } = useParams();
  const invoice = useInvoice(id);
  return <QueryView query={invoice}>{(data) => <InvoiceDetail invoice={data} />}</QueryView>;
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { can } = useSession();
  const [paying, setPaying] = useState(false);
  const canCollect = can('payments:write') && !isZero(invoice.balance);
  const pendingLines = invoice.lines.filter((line) => !isZero(line.pending.quantity));
  const payments = invoice.payments ?? [];
  const paidShare = ratio(invoice.paid, invoice.total);

  const collectButton = canCollect ? (
    <Button
      icon={<HandCoins className="size-4" />}
      onClick={() => {
        setPaying(true);
      }}
    >
      Registrar cobro
    </Button>
  ) : null;

  return (
    <>
      <BackLink fallback="/facturas" label="Facturas" />
      <PageHeader
        title={`Factura ${invoice.label}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CollectionChip status={invoice.status} />
            {invoice.hasPending ? (
              <Chip tone="warning" icon={Factory}>
                Con producto pendiente
              </Chip>
            ) : null}
            <span>
              <EntityLink to="customer" id={invoice.customer.id} className="text-ink">
                {invoice.customer.name}
              </EntityLink>{' '}
              · preventa{' '}
              <EntityLink to="order" id={invoice.order.id} className="text-ink">
                {invoice.order.label}
              </EntityLink>
            </span>
          </span>
        }
        actions={collectButton}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {invoice.hasPending ? (
            <div className="flex gap-3 rounded-[10px] border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
              <Factory
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[#b67d00]"
                strokeWidth={2.25}
              />
              <p>
                Se facturó con{' '}
                <strong className="font-semibold">
                  {plural(pendingLines.length, 'producto pendiente', 'productos pendientes')}
                </strong>{' '}
                por fabricar o comprar. Planta y compras lo tienen en sus listas; el despacho sale
                cuando esté listo, o por partes si se autorizó despacho parcial.
              </p>
            </div>
          ) : null}

          <Panel title="Detalle" description="Precios de lista sin IVA, por unidad." flush>
            <DataTable<InvoiceLine>
              label={`Líneas de ${invoice.label}`}
              rows={invoice.lines}
              rowKey={(line) => line.productId}
              columns={[
                {
                  key: 'product',
                  header: 'Producto',
                  render: (line) => (
                    <ProductCell
                      product={{
                        id: line.productId,
                        code: line.productCode,
                        name: line.productName,
                      }}
                    />
                  ),
                },
                {
                  key: 'quantity',
                  header: 'Cantidad',
                  align: 'right',
                  render: (line) => <Qty value={line.quantity} emphasis />,
                },
                {
                  key: 'stock',
                  header: 'Del stock',
                  align: 'right',
                  render: (line) => <Qty value={line.fromStock} dimZero />,
                },
                {
                  key: 'pending',
                  header: 'Pendiente',
                  align: 'right',
                  render: (line) =>
                    isZero(line.pending.quantity) ? (
                      <Qty value={line.pending} dimZero />
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5"
                        title="Por fabricar o comprar"
                      >
                        <Factory
                          aria-hidden
                          className="size-3.5 text-[#b67d00]"
                          strokeWidth={2.25}
                        />
                        <Qty value={line.pending} emphasis />
                      </span>
                    ),
                },
                {
                  key: 'price',
                  header: 'Precio unitario',
                  align: 'right',
                  render: (line) => (
                    <span className="whitespace-nowrap">{formatCop(line.unitPrice)}</span>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Valor',
                  align: 'right',
                  render: (line) => (
                    <span className="font-medium whitespace-nowrap">{formatCop(line.amount)}</span>
                  ),
                },
              ]}
            />
            <div className="flex justify-end border-t border-line px-5 py-4">
              <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
                <dt className="text-ink-2">Subtotal</dt>
                <dd className="text-right">{formatCop(invoice.subtotal)}</dd>
                <dt className="text-ink-2">IVA 19 %</dt>
                <dd className="text-right">{formatCop(invoice.tax)}</dd>
                <dt className="mt-1 border-t border-line pt-2 font-semibold">Total</dt>
                <dd className="mt-1 border-t border-line pt-2 text-right font-semibold">
                  {formatCop(invoice.total)}
                </dd>
                <dt className="text-ink-2">Pagado</dt>
                <dd className="text-right">
                  {isZero(invoice.paid) ? '$ 0' : `− ${formatCop(invoice.paid)}`}
                </dd>
                <dt className="font-semibold">Saldo</dt>
                <dd
                  className={cn(
                    'text-right text-base font-semibold',
                    invoice.status === 'OVERDUE' && 'text-critical',
                  )}
                >
                  {formatCop(invoice.balance)}
                </dd>
              </dl>
            </div>
          </Panel>

          <Panel
            title="Cobros"
            description="Pagos del cliente registrados por contabilidad."
            flush
            actions={
              canCollect ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<HandCoins className="size-3.5" />}
                  onClick={() => {
                    setPaying(true);
                  }}
                >
                  Registrar cobro
                </Button>
              ) : null
            }
          >
            {payments.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="Aún no hay cobros"
                description={
                  canCollect
                    ? 'Cuando el cliente pague, registra el cobro con su medio y referencia.'
                    : 'Contabilidad registra aquí lo que pague el cliente.'
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {formatDate(payment.paidOn)} · {payment.methodLabel}
                      </p>
                      <p className="text-[12.5px] text-ink-3">
                        {payment.reference ? `Ref. ${payment.reference} · ` : ''}Registró{' '}
                        {payment.recordedBy}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCop(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <p className="text-[13px] text-ink-2">Saldo por cobrar</p>
            <p
              className={cn(
                'mt-1 text-[28px] leading-none font-semibold tracking-tight tabular-nums',
                invoice.status === 'OVERDUE' && 'text-critical',
              )}
            >
              {formatCop(invoice.balance)}
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-[4px] bg-surface-2"
              role="img"
              aria-label={`Pagado ${String(Math.round(paidShare * 100))} % del total`}
            >
              <div
                className="h-full rounded-[4px] bg-series-1"
                style={{ width: `${String(paidShare * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[13px] text-ink-2">
              Pagado {formatCop(invoice.paid)} de {formatCop(invoice.total)} (
              {Math.round(paidShare * 100)} %)
            </p>
            {invoice.status !== 'PAID' ? (
              <p className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="text-ink-3">Vence</span>
                <DueDate date={invoice.dueDate} lateLabel="Vencida" />
              </p>
            ) : null}
          </Panel>

          <Panel title="Datos">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-ink-3">Cliente</dt>
              <dd className="min-w-0">
                <EntityLink to="customer" id={invoice.customer.id}>
                  {invoice.customer.name}
                </EntityLink>
                <span className="block text-[12.5px] text-ink-3">{invoice.customer.document}</span>
              </dd>
              <dt className="text-ink-3">Sucursal</dt>
              <dd>{invoice.branchName}</dd>
              <dt className="text-ink-3">Vendedor</dt>
              <dd>{invoice.seller.name}</dd>
              <dt className="text-ink-3">Preventa</dt>
              <dd>
                <EntityLink to="order" id={invoice.order.id}>
                  {invoice.order.label}
                </EntityLink>
              </dd>
              <dt className="text-ink-3">Emitida</dt>
              <dd>{formatDateTime(invoice.issuedAt)}</dd>
              <dt className="text-ink-3">Emitida por</dt>
              <dd>{invoice.issuedBy}</dd>
              <dt className="text-ink-3">Vence</dt>
              <dd>{formatDate(invoice.dueDate)}</dd>
              {invoice.agingLabel && invoice.status === 'OVERDUE' ? (
                <>
                  <dt className="text-ink-3">Antigüedad</dt>
                  <dd className="text-critical">{invoice.agingLabel}</dd>
                </>
              ) : null}
            </dl>
          </Panel>
        </div>
      </div>

      <PaymentDialog
        target={
          paying
            ? {
                kind: 'invoice',
                id: invoice.id,
                label: invoice.label,
                party: invoice.customer.name,
                balance: invoice.balance,
                dueDate: invoice.dueDate,
              }
            : null
        }
        onClose={() => {
          setPaying(false);
        }}
      />
    </>
  );
}
