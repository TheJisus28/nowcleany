import { Check, CircleCheck, Clock, MapPin, PackageOpen, Truck, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useShipment } from '../../api/hooks';
import type { Shipment } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { BackLink, EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, DueDate, ShipmentStatusChip } from '../../components/status';
import { Button, cn, Field, Input, PageHeader, Panel, QueryView } from '../../components/ui';
import { formatDate, formatDateTime, plural } from '../../lib/format';
import { DispatchDialog, shipmentTotals } from './dispatch-dialog';
import { Plate } from './plate';

type GuideOrder = Shipment['orders'][number];

export function ShipmentPage() {
  const { id } = useParams();
  const shipment = useShipment(id);
  return <QueryView query={shipment}>{(data) => <ShipmentView shipment={data} />}</QueryView>;
}

function ShipmentView({ shipment }: { shipment: Shipment }) {
  const { can } = useSession();
  const canWrite = can('shipments:write');
  const [dispatching, setDispatching] = useState(false);
  const [delivering, setDelivering] = useState<GuideOrder | null>(null);
  const delivered = shipment.orders.filter((order) => order.deliveredAt).length;

  return (
    <>
      <BackLink fallback="/logistica" label="Logística y guías" />
      <PageHeader
        title={`Guía ${shipment.label}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ShipmentStatusChip status={shipment.status} />
            <span>
              {plural(shipment.orders.length, 'pedido', 'pedidos')}
              {shipment.route ? ` · ${shipment.route}` : ''}
            </span>
          </span>
        }
        actions={
          shipment.status === 'PLANNED' && canWrite ? (
            <Button
              icon={<Truck className="size-4" />}
              onClick={() => {
                setDispatching(true);
              }}
            >
              Despachar
            </Button>
          ) : null
        }
      />

      <Steps shipment={shipment} delivered={delivered} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="Pedidos de la guía"
          description={
            shipment.status === 'IN_TRANSIT'
              ? `${String(delivered)} de ${String(shipment.orders.length)} entregados. Confirma cada entrega con el nombre de quien recibió.`
              : shipment.status === 'PLANNED'
                ? 'Cargados en el vehículo; la entrega se confirma cuando la guía esté en ruta.'
                : 'Todos los pedidos fueron entregados.'
          }
          flush
        >
          <ul className="divide-y divide-line">
            {shipment.orders.map((order) => (
              <OrderStop
                key={order.orderId}
                order={order}
                status={shipment.status}
                canDeliver={canWrite && shipment.status === 'IN_TRANSIT'}
                onDeliver={() => {
                  setDelivering(order);
                }}
              />
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Vehículo">
            <div className="mb-4">
              <Plate plate={shipment.vehiclePlate} size="lg" />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-ink-3">Transportador</dt>
              <dd>{shipment.carrier}</dd>
              <dt className="text-ink-3">Conductor</dt>
              <dd>{shipment.driverName}</dd>
              <dt className="text-ink-3">Ruta</dt>
              <dd>{shipment.route ?? <span className="text-ink-3">Sin ruta</span>}</dd>
              <dt className="text-ink-3">Salida</dt>
              <dd>
                {formatDate(shipment.scheduledDate)}
                {shipment.status === 'PLANNED' ? (
                  <span className="block text-[12.5px]">
                    <DueDate date={shipment.scheduledDate} lateLabel="Debió salir" />
                  </span>
                ) : null}
              </dd>
              {shipment.notes ? (
                <>
                  <dt className="text-ink-3">Notas</dt>
                  <dd className="whitespace-pre-line">{shipment.notes}</dd>
                </>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Carga" description="Total por producto en el vehículo." flush>
            <ul className="divide-y divide-line text-sm">
              {shipmentTotals(shipment).map((total) => (
                <li key={total.id} className="flex justify-between gap-4 px-5 py-2.5">
                  <EntityLink to="product" id={total.id} className="truncate">
                    {total.name}
                  </EntityLink>
                  <Qty value={total.quantity} emphasis />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {dispatching ? (
        <DispatchDialog
          shipment={shipment}
          onClose={() => {
            setDispatching(false);
          }}
        />
      ) : null}
      {delivering ? (
        <DeliverDialog
          shipment={shipment}
          order={delivering}
          onClose={() => {
            setDelivering(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Built → dispatched → delivered, with who and when (a real sequence, so it is numbered). */
function Steps({ shipment, delivered }: { shipment: Shipment; delivered: number }) {
  const steps = [
    {
      label: 'Guía armada',
      done: true,
      detail: `${formatDateTime(shipment.createdAt)} · ${shipment.createdBy}`,
    },
    {
      label: 'Despachada',
      done: shipment.dispatchedAt !== null,
      detail: shipment.dispatchedAt
        ? `${formatDateTime(shipment.dispatchedAt)} · ${shipment.dispatchedBy ?? ''}`
        : `Programada para ${formatDate(shipment.scheduledDate)}`,
    },
    {
      label: 'Entregada',
      done: shipment.status === 'DELIVERED',
      detail: shipment.deliveredAt
        ? formatDateTime(shipment.deliveredAt)
        : `${String(delivered)} de ${String(shipment.orders.length)} pedidos`,
    },
  ];
  return (
    <ol className="mb-6 grid gap-3 rounded-[10px] border border-line bg-surface p-4 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
              step.done ? 'bg-brand text-white' : 'border border-line-strong text-ink-3',
            )}
          >
            {step.done ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : index + 1}
          </span>
          <span className="min-w-0">
            <span className={cn('block text-sm font-medium', !step.done && 'text-ink-2')}>
              {step.label}
            </span>
            <span className="block truncate text-[12.5px] text-ink-3">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function OrderStop({
  order,
  status,
  canDeliver,
  onDeliver,
}: {
  order: GuideOrder;
  status: Shipment['status'];
  canDeliver: boolean;
  onDeliver: () => void;
}) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <EntityLink to="order" id={order.orderId} className="font-semibold">
              {order.orderLabel}
            </EntityLink>
            <EntityLink to="customer" id={order.customer.id}>
              {order.customer.name}
            </EntityLink>
            {order.partial ? (
              <Chip tone="warning" icon={PackageOpen}>
                Entrega parcial
              </Chip>
            ) : null}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-2">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
            <span>
              {order.branch.name}
              {order.branch.address ? ` · ${order.branch.address}` : ''}
              {order.branch.city ? `, ${order.branch.city}` : ''}
            </span>
          </p>
        </div>
        {order.deliveredAt ? (
          <span className="text-right text-[13px]">
            <Chip tone="good" icon={CircleCheck}>
              Entregado
            </Chip>
            <span className="mt-1 flex items-center justify-end gap-1 text-ink-2">
              <UserCheck aria-hidden className="size-3.5 text-ink-3" />
              {order.receivedBy ?? '—'}
            </span>
            <span className="block text-[12px] text-ink-3">
              {formatDateTime(order.deliveredAt)}
            </span>
          </span>
        ) : canDeliver ? (
          <Button size="sm" icon={<UserCheck className="size-3.5" />} onClick={onDeliver}>
            Confirmar entrega
          </Button>
        ) : status === 'PLANNED' ? (
          <Chip tone="neutral" icon={Clock}>
            Por salir
          </Chip>
        ) : (
          <Chip tone="brand" icon={Truck}>
            En camino
          </Chip>
        )}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1 rounded-md bg-surface-2/60 px-3 py-2 text-[13px] sm:grid-cols-2">
        {order.lines.map((line) => (
          <li key={line.productId} className="flex justify-between gap-3">
            <span className="truncate text-ink-2" title={line.productName}>
              {line.productName}
            </span>
            <Qty value={line.quantity} emphasis />
          </li>
        ))}
      </ul>
    </li>
  );
}

function DeliverDialog({
  shipment,
  order,
  onClose,
}: {
  shipment: Shipment;
  order: GuideOrder;
  onClose: () => void;
}) {
  const [receivedBy, setReceivedBy] = useState('');
  const deliver = useAction(
    () =>
      api.post<Shipment>(`/v1/shipments/${shipment.id}/orders/${order.orderId}/deliver`, {
        receivedBy: receivedBy.trim(),
      }),
    { success: `${order.orderLabel} entregado a ${order.customer.name}` },
  );
  const valid = receivedBy.trim().length >= 2;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Confirmar entrega de ${order.orderLabel}`}
      description={`${order.customer.name} · ${order.branch.name}${order.branch.city ? `, ${order.branch.city}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<UserCheck className="size-4" />}
            loading={deliver.isPending}
            disabled={!valid}
            onClick={() => {
              deliver.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Confirmar entrega
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) deliver.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <Field label="¿Quién recibió?" hint="Nombre de quien firmó la guía en el cliente.">
          {(props) => (
            <Input
              {...props}
              value={receivedBy}
              autoFocus
              maxLength={120}
              onChange={(event) => {
                setReceivedBy(event.target.value);
              }}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
