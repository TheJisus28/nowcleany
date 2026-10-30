import { CircleCheck, MapPin, PackageCheck, PackageOpen, Route, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useAction, useOrders, useShipments } from '../../api/hooks';
import type { SalesOrder, Shipment, ShipmentStatus } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { Kpi } from '../../components/kpi';
import { EntityLink, pathTo } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, DueDate, ShipmentStatusChip } from '../../components/status';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Textarea,
} from '../../components/ui';
import { formatDateTime, isZero, plural, todayIso } from '../../lib/format';
import { DispatchDialog } from './dispatch-dialog';
import { normalizePlate, Plate } from './plate';

/** The order goes without part of what is still pending (plant handed over only what existed). */
export function isPartialReady(order: SalesOrder): boolean {
  return order.lines.some((line) => line.ready.quantity !== line.pending.quantity);
}

/** Local calendar day of an instant ("2026-10-30"). */
function localDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const byPriority = (a: SalesOrder, b: SalesOrder) =>
  (a.priority ?? 9999) - (b.priority ?? 9999) ||
  (a.estimatedDeliveryDate ?? '9').localeCompare(b.estimatedDeliveryDate ?? '9');

export function ShipmentsPage() {
  const ready = useOrders({ status: 'READY', limit: '500' });
  const shipments = useShipments({ status: 'PLANNED,IN_TRANSIT,DELIVERED' });

  return (
    <>
      <PageHeader
        title="Logística y guías"
        description="Arma la guía con los pedidos que planta entregó a despacho, despacha el vehículo y confirma quién recibió cada pedido."
      />
      <LogisticsKpis ready={ready.data} shipments={shipments.data} />
      <Panel
        title="Listos para despacho"
        description="Facturados y alistados por planta. Selecciona los que van en el mismo vehículo."
        className="mb-6"
        flush
      >
        <QueryView query={ready}>{(rows) => <ReadyOrders rows={rows} />}</QueryView>
      </Panel>
      <Panel title="Guías" flush>
        <QueryView query={shipments}>{(rows) => <Guides rows={rows} />}</QueryView>
      </Panel>
    </>
  );
}

function LogisticsKpis({
  ready,
  shipments,
}: {
  ready: SalesOrder[] | undefined;
  shipments: Shipment[] | undefined;
}) {
  const all = shipments ?? [];
  const planned = all.filter((s) => s.status === 'PLANNED');
  const onRoad = all.filter((s) => s.status === 'IN_TRANSIT');
  const toDeliver = onRoad.flatMap((s) => s.orders).filter((o) => !o.deliveredAt).length;
  const today = todayIso();
  const deliveredToday = all
    .flatMap((s) => s.orders)
    .filter((o) => o.deliveredAt && localDay(o.deliveredAt) === today).length;
  const partial = (ready ?? []).filter(isPartialReady).length;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Listos para despacho"
        value={ready ? ready.length : '…'}
        icon={PackageCheck}
        tone={ready && ready.length > 0 ? 'brand' : 'neutral'}
        hint={partial > 0 ? plural(partial, 'va parcial', 'van parciales') : 'Todos completos'}
      />
      <Kpi
        label="Guías por despachar"
        value={shipments ? planned.length : '…'}
        icon={Route}
        hint={plural(planned.flatMap((s) => s.orders).length, 'pedido cargado', 'pedidos cargados')}
      />
      <Kpi
        label="En ruta"
        value={shipments ? onRoad.length : '…'}
        icon={Truck}
        tone={onRoad.length > 0 ? 'brand' : 'neutral'}
        hint={plural(toDeliver, 'entrega por confirmar', 'entregas por confirmar')}
      />
      <Kpi
        label="Entregados hoy"
        value={shipments ? deliveredToday : '…'}
        icon={CircleCheck}
        tone={deliveredToday > 0 ? 'good' : 'neutral'}
        hint="Pedidos con quién recibió confirmado"
      />
    </div>
  );
}

// --- orders ready for dispatch ----------------------------------------------------------------

function ReadyOrders({ rows }: { rows: SalesOrder[] }) {
  const { can } = useSession();
  const canWrite = can('shipments:write');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const sorted = useMemo(() => [...rows].sort(byPriority), [rows]);
  const chosen = sorted.filter((order) => selected.has(order.id));
  const cities = [...new Set(chosen.map((order) => order.branch.city).filter(Boolean))];

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <>
      {canWrite && sorted.length > 0 ? (
        <div className="flex flex-col gap-3 border-b border-line bg-surface-2/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-2">
            {chosen.length === 0 ? (
              'Marca los pedidos que van en el mismo vehículo.'
            ) : (
              <>
                <strong className="text-ink">{plural(chosen.length, 'pedido', 'pedidos')}</strong>
                {cities.length > 0 ? ` para ${cities.join(', ')}` : ''}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(
                  selected.size === sorted.length
                    ? new Set()
                    : new Set(sorted.map((order) => order.id)),
                );
              }}
            >
              {selected.size === sorted.length ? 'Quitar selección' : 'Seleccionar todos'}
            </Button>
            <Button
              size="sm"
              icon={<Truck className="size-3.5" />}
              disabled={chosen.length === 0}
              onClick={() => {
                setBuilding(true);
              }}
            >
              Armar guía
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable<SalesOrder>
        label="Pedidos listos para despacho"
        rows={sorted}
        rowKey={(row) => row.id}
        onRowClick={
          canWrite
            ? (row) => {
                toggle(row.id, !selected.has(row.id));
              }
            : undefined
        }
        rowClassName={(row) => (selected.has(row.id) ? 'bg-brand-soft/50' : undefined)}
        empty={
          <EmptyState
            icon={<PackageCheck />}
            title="No hay pedidos esperando vehículo"
            description="Cuando planta aliste un pedido y lo entregue a despacho, aparecerá aquí."
          />
        }
        columns={[
          {
            key: 'order',
            header: 'Pedido',
            render: (row) => (
              <span className="flex items-start gap-3">
                {canWrite ? (
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${row.label} en la guía`}
                    className="mt-1 size-4 shrink-0 accent-[#003858]"
                    checked={selected.has(row.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onChange={(event) => {
                      toggle(row.id, event.target.checked);
                    }}
                  />
                ) : null}
                <span className="min-w-0">
                  <EntityLink to="order" id={row.id} className="font-medium">
                    {row.label}
                  </EntityLink>
                  <span className="block text-[12.5px] text-ink-3">
                    <EntityLink to="customer" id={row.customer.id}>
                      {row.customer.name}
                    </EntityLink>
                  </span>
                </span>
              </span>
            ),
          },
          {
            key: 'branch',
            header: 'Entrega en',
            render: (row) => (
              <span className="flex items-start gap-1.5">
                <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <span className="min-w-0">
                  <span className="block">
                    {row.branch.city ?? 'Sin ciudad'}
                    <span className="text-ink-3"> · {row.branch.name}</span>
                  </span>
                  {row.branch.address ? (
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {row.branch.address}
                    </span>
                  ) : null}
                </span>
              </span>
            ),
          },
          {
            key: 'lines',
            header: 'Listo para cargar',
            render: (row) => (
              <ul className="flex flex-col gap-0.5 text-[13px]">
                {row.lines
                  .filter((line) => !isZero(line.ready.quantity))
                  .map((line) => (
                    <li key={line.productId}>
                      <span className="text-ink-2" title={line.productName}>
                        {line.productName}:
                      </span>{' '}
                      <Qty value={line.ready} emphasis />
                      {line.ready.quantity !== line.pending.quantity ? (
                        <span className="text-ink-3">
                          {' '}
                          de <Qty value={line.pending} />
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ),
          },
          {
            key: 'promised',
            header: 'Prometido',
            render: (row) => <DueDate date={row.estimatedDeliveryDate} />,
          },
          {
            key: 'kind',
            header: 'Despacho',
            render: (row) =>
              isPartialReady(row) ? (
                <Chip tone="warning" icon={PackageOpen}>
                  Parcial
                </Chip>
              ) : (
                <Chip tone="good" icon={CircleCheck}>
                  Completo
                </Chip>
              ),
          },
        ]}
      />

      {building ? (
        <BuildGuideDialog
          orders={chosen}
          onClose={() => {
            setBuilding(false);
          }}
          onCreated={() => {
            setSelected(new Set());
          }}
        />
      ) : null}
    </>
  );
}

function BuildGuideDialog({
  orders,
  onClose,
  onCreated,
}: {
  orders: SalesOrder[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const history = useShipments({});
  const [carrier, setCarrier] = useState('');
  const [plate, setPlate] = useState('');
  const [driver, setDriver] = useState('');
  const [route, setRoute] = useState(() =>
    [...new Set(orders.map((order) => order.branch.city).filter(Boolean))].join(' – '),
  );
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const normalized = normalizePlate(plate);
  const known = useMemo(() => {
    const rows = history.data ?? [];
    const unique = (values: string[]) => [...new Set(values)].slice(0, 20);
    return {
      carriers: unique(rows.map((s) => s.carrier)),
      plates: unique(rows.map((s) => s.vehiclePlate)),
      drivers: unique(rows.map((s) => s.driverName)),
    };
  }, [history.data]);
  const valid =
    carrier.trim().length >= 2 && normalized !== null && driver.trim().length >= 2 && Boolean(date);

  const create = useAction(
    () =>
      api.post<Shipment>('/v1/shipments', {
        orderIds: orders.map((order) => order.id),
        carrier: carrier.trim(),
        vehiclePlate: normalized ?? plate,
        driverName: driver.trim(),
        ...(route.trim() ? { route: route.trim() } : {}),
        scheduledDate: date,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    {
      success: (shipment) =>
        `${shipment.label} armada con ${plural(shipment.orders.length, 'pedido', 'pedidos')}`,
    },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Armar guía de despacho"
      description={`${plural(orders.length, 'pedido', 'pedidos')} en un vehículo. El stock baja cuando despaches la guía.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Truck className="size-4" />}
            loading={create.isPending}
            disabled={!valid}
            onClick={() => {
              create.mutate(undefined, {
                onSuccess: (shipment) => {
                  onCreated();
                  onClose();
                  void navigate(pathTo('shipment', shipment.id));
                },
              });
            }}
          >
            Armar guía
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Transportador" hint="Empresa o vehículo propio.">
          {(props) => (
            <Input
              {...props}
              value={carrier}
              autoFocus
              maxLength={120}
              list="guide-carriers"
              placeholder="Flota propia NOW CLEANY"
              onChange={(event) => {
                setCarrier(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Placa"
          hint={normalized ? undefined : 'Formato ABC123 (moto: ABC12D).'}
          error={plate.trim() && !normalized ? 'La placa debe tener el formato ABC123.' : undefined}
        >
          {(props) => (
            <div className="flex items-center gap-3">
              <Input
                {...props}
                value={plate}
                maxLength={8}
                list="guide-plates"
                placeholder="ABC123"
                className="uppercase"
                onChange={(event) => {
                  setPlate(event.target.value.toUpperCase());
                }}
              />
              {normalized ? <Plate plate={normalized} /> : null}
            </div>
          )}
        </Field>
        <Field label="Conductor">
          {(props) => (
            <Input
              {...props}
              value={driver}
              maxLength={120}
              list="guide-drivers"
              onChange={(event) => {
                setDriver(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Fecha de salida">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              min={todayIso()}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Ruta (opcional)"
          hint="Las ciudades en el orden de entrega."
          className="sm:col-span-2"
        >
          {(props) => (
            <Input
              {...props}
              value={route}
              maxLength={160}
              onChange={(event) => {
                setRoute(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              value={notes}
              maxLength={500}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <datalist id="guide-carriers">
        {known.carriers.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="guide-plates">
        {known.plates.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="guide-drivers">
        {known.drivers.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <h3 className="mt-6 mb-2 text-sm font-semibold">Van en la guía</h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-sm">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="font-medium">{order.label}</span> · {order.customer.name}
              <span className="block text-[12.5px] text-ink-3">
                {order.branch.name}
                {order.branch.city ? `, ${order.branch.city}` : ''}
              </span>
            </span>
            {isPartialReady(order) ? (
              <Chip tone="warning" icon={PackageOpen}>
                Parcial
              </Chip>
            ) : null}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

// --- guides -----------------------------------------------------------------------------------

const GUIDE_FILTERS: readonly ShipmentStatus[] = ['PLANNED', 'IN_TRANSIT', 'DELIVERED'];
const GUIDE_LABELS: Record<ShipmentStatus, string> = {
  PLANNED: 'Por despachar',
  IN_TRANSIT: 'En ruta',
  DELIVERED: 'Entregadas',
};

function Guides({ rows }: { rows: Shipment[] }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const counts = (status: ShipmentStatus) => rows.filter((row) => row.status === status).length;
  const [filter, setFilter] = useState<ShipmentStatus>(() =>
    counts('PLANNED') > 0 ? 'PLANNED' : counts('IN_TRANSIT') > 0 ? 'IN_TRANSIT' : 'DELIVERED',
  );
  const [dispatching, setDispatching] = useState<Shipment | null>(null);
  const shown = rows
    .filter((row) => row.status === filter)
    .sort((a, b) =>
      filter === 'DELIVERED'
        ? (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')
        : a.scheduledDate.localeCompare(b.scheduledDate),
    );

  return (
    <>
      <div className="overflow-x-auto border-b border-line px-4 py-3">
        <Segmented
          label="Estado de la guía"
          value={filter}
          onChange={setFilter}
          options={GUIDE_FILTERS.map((status) => ({
            value: status,
            label: `${GUIDE_LABELS[status]} · ${String(counts(status))}`,
          }))}
        />
      </div>
      <DataTable<Shipment>
        label="Guías"
        rows={shown}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          void navigate(pathTo('shipment', row.id));
        }}
        empty={
          <EmptyState
            icon={<Route />}
            title={
              filter === 'PLANNED'
                ? 'No hay guías por despachar'
                : filter === 'IN_TRANSIT'
                  ? 'No hay vehículos en ruta'
                  : 'Aún no hay guías entregadas'
            }
          />
        }
        columns={[
          {
            key: 'label',
            header: 'Guía',
            render: (row) => (
              <span>
                <EntityLink to="shipment" id={row.id} className="font-medium">
                  {row.label}
                </EntityLink>
                <span className="block text-[12.5px] text-ink-3">{row.route ?? 'Sin ruta'}</span>
              </span>
            ),
          },
          {
            key: 'vehicle',
            header: 'Vehículo',
            render: (row) => (
              <span className="flex flex-col items-start gap-1">
                <Plate plate={row.vehiclePlate} />
                <span className="text-[12.5px] text-ink-3">
                  {row.driverName} · {row.carrier}
                </span>
              </span>
            ),
          },
          {
            key: 'orders',
            header: 'Pedidos',
            render: (row) => {
              const delivered = row.orders.filter((order) => order.deliveredAt).length;
              return (
                <span>
                  {plural(row.orders.length, 'pedido', 'pedidos')}
                  {row.status === 'IN_TRANSIT' ? (
                    <span className="block text-[12.5px] text-ink-3">
                      {delivered} de {row.orders.length} entregados
                    </span>
                  ) : (
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {[
                        ...new Set(row.orders.map((order) => order.branch.city).filter(Boolean)),
                      ].join(', ')}
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: 'date',
            header: filter === 'PLANNED' ? 'Sale' : filter === 'IN_TRANSIT' ? 'Salió' : 'Entregada',
            render: (row) =>
              row.status === 'PLANNED' ? (
                <DueDate date={row.scheduledDate} lateLabel="Debió salir" />
              ) : row.status === 'IN_TRANSIT' ? (
                formatDateTime(row.dispatchedAt)
              ) : (
                formatDateTime(row.deliveredAt)
              ),
          },
          {
            key: 'status',
            header: 'Estado',
            hideOnMobile: true,
            render: (row) => <ShipmentStatusChip status={row.status} />,
          },
          {
            key: 'action',
            header: '',
            align: 'right',
            hideOnMobile: true,
            render: (row) =>
              row.status === 'PLANNED' && can('shipments:write') ? (
                <Button
                  size="sm"
                  icon={<Truck className="size-3.5" />}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDispatching(row);
                  }}
                >
                  Despachar
                </Button>
              ) : null,
          },
        ]}
      />
      {dispatching ? (
        <DispatchDialog
          shipment={dispatching}
          onClose={() => {
            setDispatching(null);
          }}
        />
      ) : null}
    </>
  );
}
