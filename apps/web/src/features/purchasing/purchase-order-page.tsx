import { CircleCheck, Clock, ReceiptText, TriangleAlert } from 'lucide-react';
import { useParams } from 'react-router';
import { usePurchaseOrder, useSupplierInvoices } from '../../api/hooks';
import type { PurchaseOrder, SupplierInvoice } from '../../api/types';
import { useAccess } from '../../app/access';
import { BackLink, EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, DueDate, PurchaseStatusChip } from '../../components/status';
import { cn, EmptyState, PageHeader, Panel, QueryView } from '../../components/ui';
import { formatCop, formatDate, formatDateTime, isZero, ratio, unitLabel } from '../../lib/format';
import { pendingValue, vatOf } from './money';
import { PurchaseOrderActions } from './order-actions';

export function PurchaseOrderPage() {
  const { id } = useParams();
  const order = usePurchaseOrder(id);
  return <QueryView query={order}>{(data) => <PurchaseOrderView order={data} />}</QueryView>;
}

function PurchaseOrderView({ order }: { order: PurchaseOrder }) {
  const { has } = useAccess();
  const open = order.status === 'OPEN' || order.status === 'PARTIAL';
  const subtotal = BigInt(order.total);
  const tax = vatOf(subtotal);
  const fallback = has('purchasing') ? '/compras' : has('receiving') ? '/recepcion' : '/';

  return (
    <>
      <BackLink fallback={fallback} label={has('purchasing') ? 'Órdenes de compra' : 'Recepción'} />
      <PageHeader
        title={order.label}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PurchaseStatusChip status={order.status} />
            <span>{order.supplier.name}</span>
          </span>
        }
        actions={<PurchaseOrderActions order={order} size="md" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Productos"
            description="Lo pedido, lo que ya llegó con las facturas y lo que falta."
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/70 text-left text-[12.5px] text-ink-2">
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pedido</th>
                    <th className="px-4 py-2.5 text-right font-medium">Recibido</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pendiente</th>
                    <th className="px-4 py-2.5 text-right font-medium">Costo unit.</th>
                    <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const done = isZero(line.pending.quantity);
                    return (
                      <tr key={line.productId} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <EntityLink to="product" id={line.productId} className="font-medium">
                            {line.productName}
                          </EntityLink>
                          <span className="block text-[12.5px] text-ink-3">{line.productCode}</span>
                          <span
                            aria-hidden
                            className="mt-1.5 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-surface-2"
                          >
                            <span
                              className={cn('block h-full', done ? 'bg-good' : 'bg-brand')}
                              style={{
                                width: `${String(Math.round(ratio(line.received.quantity, line.quantity.quantity) * 100))}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Qty value={line.quantity} emphasis />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Qty value={line.received} dimZero />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {done ? (
                            <span className="text-ink-3">—</span>
                          ) : (
                            <Qty value={line.pending} emphasis />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                          {formatCop(line.unitCost)}
                          <span className="text-[12px] text-ink-3">
                            {' '}
                            / {unitLabel(line.quantity.unit)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCop(line.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="text-sm tabular-nums">
                  <tr className="border-t border-line">
                    <td colSpan={5} className="px-4 pt-3 text-right text-ink-2">
                      Subtotal
                    </td>
                    <td className="px-4 pt-3 text-right">{formatCop(order.total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-4 pt-1 text-right text-ink-2">
                      IVA 19 %
                    </td>
                    <td className="px-4 pt-1 text-right">{formatCop(tax.toString())}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-4 pt-1 pb-3 text-right font-semibold">
                      Total
                    </td>
                    <td className="px-4 pt-1 pb-3 text-right font-semibold">
                      {formatCop((subtotal + tax).toString())}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <InvoicesSection order={order} />
        </div>

        <Panel title="Datos">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-ink-3">Proveedor</dt>
            <dd>{order.supplier.name}</dd>
            <dt className="text-ink-3">Llega</dt>
            <dd>
              {formatDate(order.expectedDate)}
              {open ? (
                <span className="block text-[12.5px]">
                  <DueDate date={order.expectedDate} lateLabel="No ha llegado" />
                </span>
              ) : null}
            </dd>
            <dt className="text-ink-3">Pedida</dt>
            <dd>
              {formatDateTime(order.createdAt)}
              <span className="block text-[12.5px] text-ink-3">por {order.createdBy}</span>
            </dd>
            {order.status === 'PARTIAL' ? (
              <>
                <dt className="text-ink-3">Falta por llegar</dt>
                <dd>{formatCop(pendingValue(order).toString())} antes de IVA</dd>
              </>
            ) : null}
            {order.receivedAt ? (
              <>
                <dt className="text-ink-3">
                  {order.status === 'CLOSED' ? 'Última entrega' : 'Recibida'}
                </dt>
                <dd>{formatDateTime(order.receivedAt)}</dd>
              </>
            ) : null}
            {order.cancelledAt ? (
              <>
                <dt className="text-ink-3">Anulada</dt>
                <dd>{formatDateTime(order.cancelledAt)}</dd>
              </>
            ) : null}
            {order.notes ? (
              <>
                <dt className="text-ink-3">Notas</dt>
                <dd className="whitespace-pre-line">{order.notes}</dd>
              </>
            ) : null}
          </dl>
        </Panel>
      </div>
    </>
  );
}

function InvoicesSection({ order }: { order: PurchaseOrder }) {
  const invoices = useSupplierInvoices({ purchaseOrderId: order.id });
  return (
    <Panel
      title="Facturas del proveedor"
      description="Ingresadas por recepción: con cada una entró la mercancía al inventario."
      flush
    >
      <QueryView query={invoices}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              icon={<ReceiptText />}
              title="Todavía no ha llegado ninguna factura"
              description="Cuando llegue la mercancía, recepción ingresa la factura contra esta orden."
            />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </ul>
          )
        }
      </QueryView>
    </Panel>
  );
}

function InvoiceRow({ invoice }: { invoice: SupplierInvoice }) {
  const paid = isZero(invoice.balance);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{invoice.documentNumber}</span>
          {paid ? (
            <Chip tone="good" icon={CircleCheck}>
              Pagada
            </Chip>
          ) : invoice.overdue ? (
            <Chip tone="critical" icon={TriangleAlert}>
              Vencida
            </Chip>
          ) : (
            <Chip tone="neutral" icon={Clock}>
              {`Vence ${formatDate(invoice.dueDate)}`}
            </Chip>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Factura del {formatDate(invoice.invoiceDate)} · ingresada por {invoice.receivedBy}
        </p>
        <ul className="mt-2 flex flex-col gap-0.5 text-[13px]">
          {invoice.lines.map((line) => (
            <li key={line.productId}>
              {line.productName}: <Qty value={line.quantity} /> × {formatCop(line.unitCost)}
            </li>
          ))}
        </ul>
      </div>
      <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[13px] tabular-nums sm:text-right">
        <dt className="text-ink-3">Subtotal</dt>
        <dd>{formatCop(invoice.subtotal)}</dd>
        <dt className="text-ink-3">IVA</dt>
        <dd>{formatCop(invoice.tax)}</dd>
        <dt className="font-medium">Total</dt>
        <dd className="font-semibold">{formatCop(invoice.total)}</dd>
      </dl>
    </li>
  );
}
