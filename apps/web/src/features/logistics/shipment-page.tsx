import { Clock, Printer, Truck, UserCheck } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useShipment, useShipments } from '../../api/hooks';
import type { Q, Shipment } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { ShipmentStatusChip } from '../../components/status';
import { Button, cn, QueryView } from '../../components/ui';
import { formatDateTime, formatDecimal, unitLabel } from '../../lib/format';
import {
  addDecimals,
  DateCell,
  DocumentNotice,
  GRID_HEAD,
  GRID_TD,
  GRID_TH,
  INPUT,
  neighbors,
  QtyTotal,
} from '../inventory/erp-kit';
import { DispatchDialog } from './dispatch-dialog';
import { Plate } from './plate';

type GuideOrder = Shipment['orders'][number];

export function ShipmentPage() {
  const { id } = useParams();
  const shipment = useShipment(id);
  const list = useShipments({});
  const ids = useMemo(
    () =>
      list.data
        ? [...list.data].sort((a, b) => a.label.localeCompare(b.label)).map((row) => row.id)
        : undefined,
    [list.data],
  );
  return (
    <QueryView query={shipment}>
      {(data) => <ShipmentDocument shipment={data} ids={ids} />}
    </QueryView>
  );
}

function ShipmentDocument({ shipment, ids }: { shipment: Shipment; ids: string[] | undefined }) {
  const { can } = useSession();
  const canWrite = can('shipments:write');
  const [dispatching, setDispatching] = useState(false);
  const [delivering, setDelivering] = useState<GuideOrder | null>(null);
  useWorkTab(`${shipment.label} · ${shipment.vehiclePlate}`);
  const delivered = shipment.orders.filter((order) => order.deliveredAt).length;
  const nav = neighbors(ids, shipment.id, (value) => `/logistica/guias/${value}`);

  const totals = useMemo(() => {
    const byProduct = new Map<string, { id: string; code: string; name: string; quantity: Q }>();
    for (const order of shipment.orders) {
      for (const line of order.lines) {
        const current = byProduct.get(line.productId);
        byProduct.set(line.productId, {
          id: line.productId,
          code: line.productCode,
          name: line.productName,
          quantity: current
            ? {
                unit: line.quantity.unit,
                quantity: addDecimals(current.quantity.quantity, line.quantity.quantity),
              }
            : line.quantity,
        });
      }
    }
    return [...byProduct.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [shipment.orders]);

  return (
    <>
      <DocumentScreen
        kind="Guía de despacho"
        number={shipment.label}
        status={<ShipmentStatusChip status={shipment.status} />}
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Despachar',
                icon: Truck,
                shortcut: 'F9',
                primary: true,
                hidden: shipment.status !== 'PLANNED' || !canWrite,
                onClick: () => {
                  setDispatching(true);
                },
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
            previous={nav.previous}
            next={nav.next}
            closeTo="/logistica"
          />
        }
        notes={
          shipment.notes ? (
            <>
              <span className="mb-0.5 block text-[12px] font-medium text-ink-3">Observaciones</span>
              <span className="whitespace-pre-line">{shipment.notes}</span>
            </>
          ) : (
            <span className="text-ink-3">Sin observaciones.</span>
          )
        }
        totals={[
          { label: 'Pedidos', value: shipment.orders.length },
          {
            label: 'Entregados',
            value: `${String(delivered)} de ${String(shipment.orders.length)}`,
          },
          {
            label: 'Carga',
            value: <QtyTotal values={totals.map((total) => total.quantity)} />,
            strong: true,
          },
        ]}
        signatures={[
          { label: 'Elaboró', name: shipment.createdBy, at: formatDateTime(shipment.createdAt) },
          {
            label: 'Despachó',
            name: shipment.dispatchedBy,
            at: shipment.dispatchedAt ? formatDateTime(shipment.dispatchedAt) : null,
          },
          { label: 'Conductor', name: shipment.driverName },
        ]}
      >
        {shipment.status === 'IN_TRANSIT' && canWrite ? (
          <DocumentNotice tone="info">
            En ruta: confirma cada entrega con el nombre de quien recibió (columna Entrega).
          </DocumentNotice>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Fecha de salida">
            <DateCell
              date={shipment.scheduledDate}
              pending={shipment.status === 'PLANNED'}
              lateLabel="Debió salir"
            />
          </HeaderField>
          <HeaderField label="Transportador">{shipment.carrier}</HeaderField>
          <HeaderField label="Placa">
            <Plate plate={shipment.vehiclePlate} />
          </HeaderField>
          <HeaderField label="Conductor">{shipment.driverName}</HeaderField>
          <HeaderField label="Ruta" span={2}>
            {shipment.route ?? <span className="text-ink-3">Sin ruta</span>}
          </HeaderField>
          <HeaderField label="Despachada">
            {shipment.dispatchedAt ? (
              <>
                {formatDateTime(shipment.dispatchedAt)}
                {shipment.dispatchedBy ? (
                  <span className="text-ink-2"> · {shipment.dispatchedBy}</span>
                ) : null}
              </>
            ) : (
              <span className="text-ink-3">Por despachar</span>
            )}
          </HeaderField>
          <HeaderField label="Entregada">
            {shipment.deliveredAt ? (
              formatDateTime(shipment.deliveredAt)
            ) : (
              <span className="text-ink-3">
                {delivered} de {shipment.orders.length} pedidos
              </span>
            )}
          </HeaderField>
        </HeaderGrid>

        <DocumentSection title="Detalle de la guía" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                  <th className={GRID_TH}>Pedido</th>
                  <th className={GRID_TH}>Cliente / entrega</th>
                  <th className={cn(GRID_TH, 'w-24')}>Código</th>
                  <th className={GRID_TH}>Producto</th>
                  <th className={cn(GRID_TH, 'w-12')}>Und</th>
                  <th className={cn(GRID_TH, 'text-right')}>Cantidad</th>
                  <th className={cn(GRID_TH, 'w-48')}>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {shipment.orders.map((order, index) => (
                  <Fragment key={order.orderId}>
                    {order.lines.map((line, lineIndex) => (
                      <tr
                        key={line.productId}
                        className={cn(
                          lineIndex === order.lines.length - 1 && 'border-b border-line',
                        )}
                      >
                        {lineIndex === 0 ? (
                          <>
                            <td
                              rowSpan={order.lines.length}
                              className={cn(
                                GRID_TD,
                                'text-center align-top text-ink-3 tabular-nums',
                              )}
                            >
                              {index + 1}
                            </td>
                            <td rowSpan={order.lines.length} className={cn(GRID_TD, 'align-top')}>
                              <EntityLink to="order" id={order.orderId} className="font-medium">
                                {order.orderLabel}
                              </EntityLink>
                              {order.partial ? (
                                <span className="block text-[12px] text-[#9a6a00]">
                                  Entrega parcial
                                </span>
                              ) : null}
                            </td>
                            <td rowSpan={order.lines.length} className={cn(GRID_TD, 'align-top')}>
                              <EntityLink
                                to="customer"
                                id={order.customer.id}
                                className="font-medium"
                              >
                                {order.customer.name}
                              </EntityLink>
                              <span className="block text-[12.5px] text-ink-2">
                                {order.branch.name}
                                {order.branch.address ? ` · ${order.branch.address}` : ''}
                                {order.branch.city ? `, ${order.branch.city}` : ''}
                              </span>
                            </td>
                          </>
                        ) : null}
                        <td className={cn(GRID_TD, 'tabular-nums')}>{line.productCode}</td>
                        <td className={GRID_TD}>{line.productName}</td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>
                          {unitLabel(line.quantity.unit)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                          {formatDecimal(line.quantity.quantity)}
                        </td>
                        {lineIndex === 0 ? (
                          <td rowSpan={order.lines.length} className={cn(GRID_TD, 'align-top')}>
                            <Delivery
                              order={order}
                              status={shipment.status}
                              canDeliver={canWrite && shipment.status === 'IN_TRANSIT'}
                              onDeliver={() => {
                                setDelivering(order);
                              }}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </DocumentSection>

        <DocumentSection title="Carga total por producto" flush>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className={GRID_HEAD}>
                <th className={cn(GRID_TH, 'w-24 pl-5')}>Código</th>
                <th className={GRID_TH}>Producto</th>
                <th className={cn(GRID_TH, 'w-12')}>Und</th>
                <th className={cn(GRID_TH, 'pr-5 text-right')}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((total) => (
                <tr key={total.id} className="border-b border-line last:border-0">
                  <td className={cn(GRID_TD, 'pl-5 tabular-nums')}>{total.code}</td>
                  <td className={GRID_TD}>
                    <EntityLink to="product" id={total.id}>
                      {total.name}
                    </EntityLink>
                  </td>
                  <td className={cn(GRID_TD, 'text-ink-2')}>{unitLabel(total.quantity.unit)}</td>
                  <td className={cn(GRID_TD, 'pr-5 text-right font-semibold tabular-nums')}>
                    {formatDecimal(total.quantity.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocumentSection>
      </DocumentScreen>

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

function Delivery({
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
  if (order.deliveredAt) {
    return (
      <span className="block text-[13px]">
        <span className="inline-flex items-center gap-1 font-medium text-good">
          <UserCheck aria-hidden className="size-3.5" />
          {order.receivedBy ?? 'Entregado'}
        </span>
        <span className="block text-[12px] text-ink-3">{formatDateTime(order.deliveredAt)}</span>
      </span>
    );
  }
  if (canDeliver) {
    return (
      <Button
        size="sm"
        variant="secondary"
        className="no-print"
        icon={<UserCheck className="size-3.5" />}
        onClick={onDeliver}
      >
        Confirmar entrega
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-ink-2">
      {status === 'PLANNED' ? (
        <>
          <Clock aria-hidden className="size-3.5 text-ink-3" />
          Por salir
        </>
      ) : (
        <>
          <Truck aria-hidden className="size-3.5 text-brand" />
          En camino
        </>
      )}
      <span className="hidden print:inline"> · Recibió: ____________</span>
    </span>
  );
}

/** Short data: who received the order at the customer. */
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
  const submit = () => {
    if (valid && !deliver.isPending) deliver.mutate(undefined, { onSuccess: onClose });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Confirmar entrega de ${order.orderLabel}`}
      description={`${order.customer.name} · ${order.branch.name}${order.branch.city ? `, ${order.branch.city}` : ''}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Volver
          </Button>
          <Button
            size="sm"
            icon={<UserCheck className="size-4" />}
            loading={deliver.isPending}
            disabled={!valid}
            onClick={submit}
          >
            Confirmar entrega
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">¿Quién recibió?</span>
          <input
            className={INPUT}
            value={receivedBy}
            autoFocus
            maxLength={120}
            onChange={(event) => {
              setReceivedBy(event.target.value);
            }}
          />
          <span className="text-[12px] text-ink-3">Nombre de quien recibió en el cliente.</span>
        </label>
      </form>
    </Dialog>
  );
}
