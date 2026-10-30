import { Ban, Pencil, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import {
  useAction,
  useOrder,
  useOrderCoverage,
  useOrderHistory,
  useOrderInvoice,
  useShipments,
} from '../../api/hooks';
import type { OrderStatus, SalesOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useProfile, useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { BackLink, EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import {
  CollectionChip,
  CoverageChip,
  flowIndex,
  ORDER_FLOW,
  OrderStatusChip,
  ShipmentStatusChip,
} from '../../components/status';
import { Button, cn, Field, PageHeader, Panel, QueryView, Textarea } from '../../components/ui';
import { formatCop, formatDate, formatDateTime, isZero, relativeDays } from '../../lib/format';

const COMMITTED: readonly OrderStatus[] = ['CONFIRMED', 'INVOICED', 'READY', 'PARTIAL'];

export function OrderDetailPage() {
  const { id } = useParams();
  const order = useOrder(id);
  return <QueryView query={order}>{(data) => <OrderDetail order={data} />}</QueryView>;
}

/** Where the order is in the flow and who must act next. */
function FlowStepper({ order }: { order: SalesOrder }) {
  const current = flowIndex(order.status);
  if (order.status === 'CANCELLED') {
    return (
      <Panel className="mb-6">
        <p className="text-sm text-ink-2">
          Anulada el {formatDateTime(order.cancelledAt)} por {order.cancelledBy ?? '—'}:{' '}
          {order.cancelReason}
        </p>
      </Panel>
    );
  }
  return (
    <section className="mb-6 rounded-[10px] border border-line bg-surface px-5 py-4">
      <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
        {ORDER_FLOW.map((step, index) => {
          const done = index < current || order.status === 'DELIVERED';
          const active = index === Math.ceil(current) && order.status !== 'DELIVERED';
          return (
            <li key={step.status} className="relative flex flex-col items-start gap-1.5 pr-3">
              <div className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                    done
                      ? 'bg-brand text-white'
                      : active
                        ? 'bg-aqua text-brand ring-4 ring-aqua/25'
                        : 'bg-surface-2 text-ink-3',
                  )}
                >
                  {index + 1}
                </span>
                {index < ORDER_FLOW.length - 1 ? (
                  <span
                    aria-hidden
                    className={cn('h-0.5 flex-1 rounded', done ? 'bg-brand' : 'bg-line')}
                  />
                ) : null}
              </div>
              <p className={cn('text-[13px] font-medium', active ? 'text-ink' : 'text-ink-2')}>
                {step.label}
              </p>
              <p className="text-[12px] text-ink-3">{step.role}</p>
            </li>
          );
        })}
      </ol>
      {order.nextStep ? (
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">
          <span className="font-medium text-ink">Ahora:</span> {order.nextStep}.
          {order.status === 'PARTIAL'
            ? ' Ya salió una parte; el resto sale cuando se fabrique o se compre.'
            : ''}
        </p>
      ) : null}
    </section>
  );
}

function OrderDetail({ order }: { order: SalesOrder }) {
  const profile = useProfile();
  const { can } = useSession();
  const { has, canOpen } = useAccess();
  const coverage = useOrderCoverage(can('planning:read') && COMMITTED.includes(order.status));
  const lineCoverage = coverage.data?.find((row) => row.orderId === order.id);
  const invoice = useOrderInvoice(order.id, can('invoices:read') && order.invoicedAt !== null);
  const shipments = useShipments(
    { orderId: order.id },
    can('shipments:read') && order.readyAt !== null,
  );
  const history = useOrderHistory(order.id);
  const [cancelOpen, setCancelOpen] = useState(false);

  const canManage =
    can('sales-orders:write') && (order.seller.id === profile.id || can('sales-orders:manage-all'));
  const submit = useAction(() => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/confirm`), {
    success: `${order.label} enviada al consolidado`,
  });
  const shipped = order.lines.some((line) => !isZero(line.dispatched.quantity));

  return (
    <>
      <BackLink fallback={has('sales') ? '/ventas' : '/'} label="Volver" />
      <PageHeader
        title={order.label}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusChip status={order.status} />
            {lineCoverage ? <CoverageChip status={lineCoverage.status} /> : null}
            <span>
              <EntityLink to="customer" id={order.customer.id}>
                {order.customer.name}
              </EntityLink>{' '}
              · registrada por {order.seller.name}
            </span>
          </span>
        }
        actions={
          <>
            {order.status === 'DRAFT' && canManage ? (
              <Link
                to={`/ventas/${order.id}/editar`}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"
              >
                <Pencil aria-hidden className="size-4" />
                Editar
              </Link>
            ) : null}
            {(order.status === 'DRAFT' || order.status === 'CONFIRMED') && canManage ? (
              <Button
                variant="danger"
                icon={<Ban className="size-4" />}
                onClick={() => {
                  setCancelOpen(true);
                }}
              >
                Anular
              </Button>
            ) : null}
            {order.status === 'DRAFT' && canManage ? (
              <Button
                icon={<Send className="size-4" />}
                loading={submit.isPending}
                onClick={() => {
                  submit.mutate(undefined);
                }}
              >
                Enviar al consolidado
              </Button>
            ) : null}
          </>
        }
      />

      <FlowStepper order={order} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Panel title="Productos" flush>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/70 text-left text-[12.5px] text-ink-2">
                    <th className="px-4 py-2.5 font-medium">Producto</th>
                    <th className="px-4 py-2.5 text-right font-medium">Vendido</th>
                    {shipped ? (
                      <th className="px-4 py-2.5 text-right font-medium">Despachado</th>
                    ) : null}
                    {lineCoverage ? (
                      <>
                        <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                          Del stock
                        </th>
                        <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                          Por fabricar
                        </th>
                        <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                          Por comprar
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => {
                    const covered = lineCoverage?.lines.find(
                      (l) => l.product.id === line.productId,
                    );
                    return (
                      <tr key={line.productId} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <ProductCell
                            product={{
                              id: line.productId,
                              code: line.productCode,
                              name: line.productName,
                            }}
                          />
                          {covered ? (
                            <div className="mt-1.5 sm:hidden">
                              <CoverageChip status={covered.status} />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Qty value={line.quantity} emphasis />
                        </td>
                        {shipped ? (
                          <td className="px-4 py-3 text-right">
                            <Qty value={line.dispatched} dimZero />
                          </td>
                        ) : null}
                        {lineCoverage ? (
                          <>
                            <td className="hidden px-4 py-3 text-right sm:table-cell">
                              {covered ? <Qty value={covered.fromStock} dimZero /> : '—'}
                            </td>
                            <td className="hidden px-4 py-3 text-right sm:table-cell">
                              {covered ? <Qty value={covered.fromProduction} dimZero /> : '—'}
                            </td>
                            <td className="hidden px-4 py-3 text-right sm:table-cell">
                              {covered ? (
                                <Qty
                                  value={covered.uncovered}
                                  dimZero
                                  className={covered.status === 'SHORT' ? 'text-critical' : ''}
                                />
                              ) : (
                                '—'
                              )}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {order.status === 'DRAFT' ? (
              <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3">
                Mientras esté en borrador no compromete producto ni cuenta para planta y compras.
              </p>
            ) : lineCoverage ? (
              <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3">
                Cobertura de hoy según la prioridad del consolidado: lo que falta ya aparece en
                planta (por fabricar) y en compras (por comprar).
              </p>
            ) : null}
          </Panel>

          <Panel
            title="Traza"
            description="Quién hizo y autorizó cada paso de este pedido."
            className="order-last lg:order-none"
          >
            <QueryView query={history}>
              {(entries) =>
                entries.length === 0 ? (
                  <p className="text-sm text-ink-3">Sin pasos registrados.</p>
                ) : (
                  <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
                    {entries.map((entry) => (
                      <li key={entry.id} className="relative pl-6">
                        <span
                          aria-hidden
                          className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-surface bg-brand"
                        />
                        <p className="text-sm text-ink">{entry.summary}</p>
                        <p className="text-[12.5px] text-ink-3">
                          {entry.actor.name}
                          {entry.actor.role ? ` (${entry.actor.role})` : ''} ·{' '}
                          {formatDateTime(entry.occurredAt)}
                          {entry.label !== order.label ? ` · ${entry.label}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                )
              }
            </QueryView>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Datos">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-ink-3">Cliente</dt>
              <dd>
                <EntityLink to="customer" id={order.customer.id}>
                  {order.customer.name}
                </EntityLink>
                <span className="block text-[12.5px] text-ink-3">
                  {order.customer.documentType === 'NIT' ? 'NIT' : 'Cédula'}{' '}
                  {order.customer.documentNumber}
                </span>
              </dd>
              <dt className="text-ink-3">Entregar en</dt>
              <dd>
                {order.branch.name}
                <span className="block text-[12.5px] text-ink-3">
                  {[order.branch.address, order.branch.city].filter(Boolean).join(', ') ||
                    'Sin dirección'}
                </span>
              </dd>
              <dt className="text-ink-3">Vendedor</dt>
              <dd>{order.seller.name}</dd>
              <dt className="text-ink-3">Fecha prometida</dt>
              <dd>
                {formatDate(order.estimatedDeliveryDate)}
                {COMMITTED.includes(order.status) || order.status === 'DRAFT' ? (
                  <span className="block text-[12.5px] text-ink-3">
                    {relativeDays(order.estimatedDeliveryDate)}
                  </span>
                ) : null}
              </dd>
              {order.priority !== null ? (
                <>
                  <dt className="text-ink-3">Prioridad</dt>
                  <dd>{order.priority} (la puso el consolidado)</dd>
                </>
              ) : null}
              {order.invoicedAt ? (
                <>
                  <dt className="text-ink-3">Despacho</dt>
                  <dd>{order.allowPartial ? 'Parcial permitido' : 'Completo'}</dd>
                </>
              ) : null}
              {order.receivedBy ? (
                <>
                  <dt className="text-ink-3">Recibió</dt>
                  <dd>
                    {order.receivedBy}
                    <span className="block text-[12.5px] text-ink-3">
                      {formatDateTime(order.deliveredAt)}
                    </span>
                  </dd>
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

          {invoice.data?.[0] ? (
            <Panel title="Factura">
              {(() => {
                const bill = invoice.data[0];
                return (
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      {canOpen('invoice') ? (
                        <EntityLink to="invoice" id={bill.id} className="font-medium">
                          {bill.label}
                        </EntityLink>
                      ) : (
                        <span className="font-medium">{bill.label}</span>
                      )}
                      <CollectionChip status={bill.status} />
                    </div>
                    <p className="text-ink-2">
                      Total <span className="font-medium text-ink">{formatCop(bill.total)}</span> ·
                      saldo {formatCop(bill.balance)}
                    </p>
                    <p className="text-[12.5px] text-ink-3">
                      Emitida por {bill.issuedBy} · vence {formatDate(bill.dueDate)}
                    </p>
                    {bill.hasPending ? (
                      <p className="text-[12.5px] text-ink-2">
                        Se facturó con producto pendiente por fabricar o comprar.
                      </p>
                    ) : null}
                  </div>
                );
              })()}
            </Panel>
          ) : null}

          {shipments.data && shipments.data.length > 0 ? (
            <Panel title="Guías" flush>
              <ul className="divide-y divide-line">
                {shipments.data.map((shipment) => {
                  const entry = shipment.orders.find((o) => o.orderId === order.id);
                  return (
                    <li key={shipment.id} className="flex flex-col gap-1 px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <EntityLink to="shipment" id={shipment.id} className="font-medium">
                          {shipment.label}
                        </EntityLink>
                        <ShipmentStatusChip status={shipment.status} />
                      </div>
                      <p className="text-[12.5px] text-ink-3">
                        {shipment.vehiclePlate} · {shipment.driverName}
                        {entry?.partial ? ' · parcial' : ''}
                        {entry?.receivedBy ? ` · recibió ${entry.receivedBy}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      <CancelDialog
        order={order}
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
        }}
      />
    </>
  );
}

function CancelDialog({
  order,
  open,
  onClose,
}: {
  order: SalesOrder;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const cancel = useAction(
    () => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/cancel`, { reason }),
    { success: `${order.label} anulada: deja de comprometer producto` },
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Anular ${order.label}`}
      description="Deja de contar para planta y compras. Esta acción no se puede deshacer."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => {
              cancel.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Anular preventa
          </Button>
        </>
      }
    >
      <Field label="Motivo de la anulación">
        {(props) => (
          <Textarea
            {...props}
            value={reason}
            maxLength={300}
            autoFocus
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
