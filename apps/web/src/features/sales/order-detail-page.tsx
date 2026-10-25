import { Ban, Check, Pencil, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useOrder, useOrderCoverage } from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useProfile, useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { BackLink, EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { CoverageChip, OrderStatusChip } from '../../components/status';
import { Button, Field, PageHeader, Panel, QueryView, Textarea } from '../../components/ui';
import { formatDate, formatDateTime, relativeDays } from '../../lib/format';

export function OrderDetailPage() {
  const { id } = useParams();
  const order = useOrder(id);
  return <QueryView query={order}>{(data) => <OrderDetail order={data} />}</QueryView>;
}

function OrderDetail({ order }: { order: SalesOrder }) {
  const profile = useProfile();
  const { can } = useSession();
  const { has } = useAccess();
  const coverage = useOrderCoverage(can('planning:read') && order.status === 'CONFIRMED');
  const lineCoverage = coverage.data?.find((row) => row.orderId === order.id);
  const [cancelOpen, setCancelOpen] = useState(false);

  const canManage =
    can('sales-orders:write') && (order.seller.id === profile.id || can('sales-orders:manage-all'));
  const confirm = useAction(() => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/confirm`), {
    success: `${order.label} confirmada: planta y compras ya la ven`,
  });
  const dispatch = useAction(() => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/dispatch`), {
    success: `${order.label} despachada`,
  });

  return (
    <>
      <BackLink
        fallback={has('sales') ? '/ventas' : '/inventario?vista=por-despachar'}
        label={has('sales') ? 'Preventas' : 'Inventario'}
      />
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
                icon={<Check className="size-4" />}
                loading={confirm.isPending}
                onClick={() => {
                  confirm.mutate(undefined);
                }}
              >
                Confirmar preventa
              </Button>
            ) : null}
            {order.status === 'CONFIRMED' && can('sales-orders:dispatch') ? (
              <Button
                icon={<Truck className="size-4" />}
                loading={dispatch.isPending}
                onClick={() => {
                  dispatch.mutate(undefined);
                }}
              >
                Despachar
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="Productos" flush>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/70 text-left text-[12.5px] text-ink-2">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                {lineCoverage ? (
                  <>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                      Desde stock
                    </th>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                      Por producir
                    </th>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                      Sin cobertura
                    </th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => {
                const covered = lineCoverage?.lines.find((l) => l.product.id === line.productId);
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
          {order.status === 'DRAFT' ? (
            <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3">
              Mientras esté en borrador no compromete stock ni cuenta para planta y compras.
            </p>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Datos">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-ink-3">Cliente</dt>
              <dd>
                <EntityLink to="customer" id={order.customer.id}>
                  {order.customer.name}
                </EntityLink>
                {order.customer.taxId ? (
                  <span className="block text-[12.5px] text-ink-3">NIT {order.customer.taxId}</span>
                ) : null}
              </dd>
              <dt className="text-ink-3">Vendedor</dt>
              <dd>{order.seller.name}</dd>
              <dt className="text-ink-3">Entrega</dt>
              <dd>
                {formatDate(order.estimatedDeliveryDate)}
                {order.status === 'CONFIRMED' || order.status === 'DRAFT' ? (
                  <span className="block text-[12.5px] text-ink-3">
                    {relativeDays(order.estimatedDeliveryDate)}
                  </span>
                ) : null}
              </dd>
              {order.notes ? (
                <>
                  <dt className="text-ink-3">Notas</dt>
                  <dd className="whitespace-pre-line">{order.notes}</dd>
                </>
              ) : null}
            </dl>
          </Panel>
          <Panel title="Historial">
            <ol className="flex flex-col gap-3 text-sm">
              <TimelineItem label="Registrada" at={order.createdAt} by={order.seller.name} />
              {order.confirmedAt ? (
                <TimelineItem label="Confirmada" at={order.confirmedAt} />
              ) : null}
              {order.dispatchedAt ? (
                <TimelineItem label="Despachada" at={order.dispatchedAt} by={order.dispatchedBy} />
              ) : null}
              {order.cancelledAt ? (
                <TimelineItem
                  label="Anulada"
                  at={order.cancelledAt}
                  by={order.cancelledBy}
                  detail={order.cancelReason}
                />
              ) : null}
            </ol>
          </Panel>
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

function TimelineItem({
  label,
  at,
  by,
  detail,
}: {
  label: string;
  at: string;
  by?: string | null;
  detail?: string | null;
}) {
  return (
    <li className="relative pl-5 before:absolute before:top-2 before:left-0 before:size-2 before:rounded-full before:bg-brand">
      <p className="font-medium">{label}</p>
      <p className="text-[12.5px] text-ink-3">
        {formatDateTime(at)}
        {by ? ` · ${by}` : ''}
      </p>
      {detail ? <p className="mt-0.5 text-[13px] text-ink-2">{detail}</p> : null}
    </li>
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
    { success: `${order.label} anulada: el producto comprometido se libera` },
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Anular ${order.label}`}
      description="El producto reservado vuelve a quedar disponible. Esta acción no se puede deshacer."
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
