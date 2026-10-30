import { Plus, Save, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useOrders, useShipments } from '../../api/hooks';
import type { Q, SalesOrder, Shipment } from '../../api/types';
import { useProfile } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  LookupDialog,
  type LookupItem,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { cn } from '../../components/ui';
import { formatDate, formatDecimal, isZero, plural, todayIso, unitLabel } from '../../lib/format';
import {
  addDecimals,
  DocumentNotice,
  GRID_HEAD,
  GRID_TD,
  GRID_TH,
  INPUT,
  QtyTotal,
  TEXTAREA,
} from '../inventory/erp-kit';
import { normalizePlate, Plate } from './plate';
import { isPartialReady } from './shipments-page';

interface Form {
  orderIds: string[];
  scheduledDate: string;
  carrier: string;
  plate: string;
  driver: string;
  route: string;
  notes: string;
}

const readyLines = (order: SalesOrder) =>
  order.lines.filter((line) => !isZero(line.ready.quantity));

/** "Montería – Cereté" from the cities of the orders, in the order they were added. */
const routeOf = (orders: SalesOrder[]) =>
  [...new Set(orders.map((order) => order.branch.city).filter(Boolean))].join(' – ');

/**
 * The shipping guide as one document: vehicle and driver in the header, the orders it carries with
 * their products in the grid (F2 adds an order ready for dispatch), the load per product below.
 */
export function ShipmentFormPage() {
  useWorkTab('Nueva guía de despacho');
  const navigate = useNavigate();
  const profile = useProfile();
  const [params] = useSearchParams();
  const ready = useOrders({ status: 'READY', limit: '500' });
  const history = useShipments({});
  const [form, setForm] = useState<Form>(() => ({
    orderIds: (params.get('pedidos') ?? '').split(',').filter(Boolean),
    scheduledDate: todayIso(),
    carrier: '',
    plate: '',
    driver: '',
    route: '',
    notes: '',
  }));
  const [routeTouched, setRouteTouched] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const draft = useDraft('shipment.new', form, {
    isEmpty: (value) =>
      value.orderIds.length === 0 && !value.carrier && !value.plate && !value.driver,
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const touch = (field: string) => {
    setTouched((current) => new Set(current).add(field));
  };

  const byId = useMemo(
    () => new Map((ready.data ?? []).map((order) => [order.id, order])),
    [ready.data],
  );
  const orders = form.orderIds
    .map((id) => byId.get(id))
    .filter((order): order is SalesOrder => Boolean(order));
  const missingIds = ready.data ? form.orderIds.filter((id) => !byId.has(id)) : [];
  const route = routeTouched ? form.route : form.route || routeOf(orders);
  const plate = normalizePlate(form.plate);
  const known = useMemo(() => {
    const rows = history.data ?? [];
    const unique = (values: string[]) => [...new Set(values)].slice(0, 30);
    return {
      carriers: unique(rows.map((row) => row.carrier)),
      plates: unique(rows.map((row) => row.vehiclePlate)),
      drivers: unique(rows.map((row) => row.driverName)),
    };
  }, [history.data]);
  const available = useMemo<LookupItem[]>(
    () =>
      (ready.data ?? [])
        .filter((order) => !form.orderIds.includes(order.id))
        .map((order) => ({
          id: order.id,
          code: order.label,
          label: order.customer.name,
          detail: `${order.branch.city ?? 'Sin ciudad'}${isPartialReady(order) ? ' · parcial' : ''}`,
        })),
    [ready.data, form.orderIds],
  );

  const totals = useMemo(() => {
    const byProduct = new Map<string, { id: string; code: string; name: string; quantity: Q }>();
    for (const order of orders) {
      for (const line of readyLines(order)) {
        const current = byProduct.get(line.productId);
        byProduct.set(line.productId, {
          id: line.productId,
          code: line.productCode,
          name: line.productName,
          quantity: current
            ? {
                unit: line.ready.unit,
                quantity: addDecimals(current.quantity.quantity, line.ready.quantity),
              }
            : line.ready,
        });
      }
    }
    return [...byProduct.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [orders]);

  const errors = {
    orders: orders.length === 0 ? 'Agrega al menos un pedido (F2).' : undefined,
    carrier: form.carrier.trim().length < 2 ? 'Escribe el transportador.' : undefined,
    plate: !plate ? 'La placa debe tener el formato ABC123 (moto: ABC12D).' : undefined,
    driver: form.driver.trim().length < 2 ? 'Escribe el nombre del conductor.' : undefined,
    date: !form.scheduledDate ? 'Indica la fecha de salida.' : undefined,
  };
  const valid = Object.values(errors).every((error) => !error);
  const show = (field: keyof typeof errors) =>
    touched.has(field) && errors[field] ? (
      <span className="mt-1 block text-[12px] text-critical">{errors[field]}</span>
    ) : null;

  const create = useAction(
    () =>
      api.post<Shipment>('/v1/shipments', {
        orderIds: orders.map((order) => order.id),
        carrier: form.carrier.trim(),
        vehiclePlate: plate ?? form.plate,
        driverName: form.driver.trim(),
        ...(route.trim() ? { route: route.trim() } : {}),
        scheduledDate: form.scheduledDate,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      }),
    {
      success: (shipment) =>
        `${shipment.label} guardada con ${plural(shipment.orders.length, 'pedido', 'pedidos')}`,
    },
  );
  const save = () => {
    setTouched(new Set(Object.keys(errors)));
    if (!valid || create.isPending) return;
    create.mutate(undefined, {
      onSuccess: (shipment) => {
        draft.clear();
        void navigate(`/logistica/guias/${shipment.id}`, { replace: true });
      },
    });
  };

  return (
    <>
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) {
              setForm(restored);
              setRouteTouched(Boolean(restored.route));
            }
          }}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind="Guía de despacho"
        number="Nueva"
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Guardar',
                icon: Save,
                shortcut: 'Ctrl+S',
                primary: true,
                loading: create.isPending,
                onClick: save,
              },
              {
                label: 'Agregar pedido',
                icon: Plus,
                shortcut: 'F2',
                onClick: () => {
                  setAdding(true);
                },
              },
            ]}
            closeTo="/logistica"
          />
        }
        notes={
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">Observaciones</span>
            <textarea
              className={TEXTAREA}
              value={form.notes}
              maxLength={500}
              placeholder="Horario de cargue, indicaciones para el conductor…"
              onChange={(event) => {
                set('notes', event.target.value);
              }}
            />
          </label>
        }
        totals={[
          { label: 'Pedidos', value: orders.length },
          { label: 'Clientes', value: new Set(orders.map((order) => order.customer.id)).size },
          {
            label: 'Carga',
            value: <QtyTotal values={totals.map((total) => total.quantity)} />,
            strong: true,
          },
        ]}
        signatures={[{ label: 'Elaboró', name: profile.fullName, at: formatDate(todayIso()) }]}
      >
        {missingIds.length > 0 ? (
          <DocumentNotice>
            {plural(missingIds.length, 'pedido ya no está', 'pedidos ya no están')} por despachar
            (otra guía los llevó) y se quitaron de esta.
          </DocumentNotice>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Fecha de salida" htmlFor="sh-date">
            <input
              id="sh-date"
              type="date"
              className={INPUT}
              value={form.scheduledDate}
              min={todayIso()}
              onChange={(event) => {
                set('scheduledDate', event.target.value);
              }}
            />
            {show('date')}
          </HeaderField>
          <HeaderField label="Transportador" htmlFor="sh-carrier">
            <input
              id="sh-carrier"
              className={INPUT}
              value={form.carrier}
              maxLength={120}
              list="sh-carriers"
              placeholder="Flota propia NOW CLEANY"
              aria-invalid={touched.has('carrier') && errors.carrier ? true : undefined}
              onChange={(event) => {
                set('carrier', event.target.value);
              }}
              onBlur={() => {
                touch('carrier');
              }}
            />
            {show('carrier')}
          </HeaderField>
          <HeaderField label="Placa" htmlFor="sh-plate">
            <span className="flex items-center gap-2">
              <input
                id="sh-plate"
                className={cn(INPUT, 'w-28 uppercase')}
                value={form.plate}
                maxLength={8}
                list="sh-plates"
                placeholder="ABC123"
                aria-invalid={touched.has('plate') && errors.plate ? true : undefined}
                onChange={(event) => {
                  set('plate', event.target.value.toUpperCase());
                }}
                onBlur={() => {
                  touch('plate');
                }}
              />
              {plate ? <Plate plate={plate} /> : null}
            </span>
            {show('plate')}
          </HeaderField>
          <HeaderField label="Conductor" htmlFor="sh-driver">
            <input
              id="sh-driver"
              className={INPUT}
              value={form.driver}
              maxLength={120}
              list="sh-drivers"
              aria-invalid={touched.has('driver') && errors.driver ? true : undefined}
              onChange={(event) => {
                set('driver', event.target.value);
              }}
              onBlur={() => {
                touch('driver');
              }}
            />
            {show('driver')}
          </HeaderField>
          <HeaderField label="Ruta (ciudades en orden de entrega)" span={3} htmlFor="sh-route">
            <input
              id="sh-route"
              className={INPUT}
              value={route}
              maxLength={160}
              onChange={(event) => {
                setRouteTouched(true);
                set('route', event.target.value);
              }}
            />
          </HeaderField>
          <HeaderField label="Bodega de salida">Despacho</HeaderField>
        </HeaderGrid>
        <datalist id="sh-carriers">
          {known.carriers.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="sh-plates">
          {known.plates.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="sh-drivers">
          {known.drivers.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>

        <DocumentSection
          title="Pedidos que lleva"
          actions={
            <button
              type="button"
              onClick={() => {
                setAdding(true);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12.5px] font-medium text-brand hover:bg-brand-soft"
            >
              <Plus aria-hidden className="size-3.5" />
              Agregar pedido (F2)
            </button>
          }
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                  <th className={GRID_TH}>Pedido</th>
                  <th className={GRID_TH}>Cliente / entrega</th>
                  <th className={cn(GRID_TH, 'w-24')}>Código</th>
                  <th className={GRID_TH}>Producto</th>
                  <th className={cn(GRID_TH, 'w-12')}>Und</th>
                  <th className={cn(GRID_TH, 'text-right')}>Cantidad</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-ink-3">
                      {show('orders') ??
                        'Sin pedidos. Pulsa F2 para agregar los que van en este vehículo.'}
                    </td>
                  </tr>
                ) : (
                  orders.map((order, index) => {
                    const lines = readyLines(order);
                    return (
                      <Fragment key={order.id}>
                        {lines.map((line, lineIndex) => (
                          <tr
                            key={line.productId}
                            className={cn(
                              'border-line',
                              lineIndex === lines.length - 1 ? 'border-b' : '',
                            )}
                          >
                            {lineIndex === 0 ? (
                              <>
                                <td
                                  rowSpan={lines.length}
                                  className={cn(
                                    GRID_TD,
                                    'text-center align-top text-ink-3 tabular-nums',
                                  )}
                                >
                                  {index + 1}
                                </td>
                                <td rowSpan={lines.length} className={cn(GRID_TD, 'align-top')}>
                                  <EntityLink to="order" id={order.id} className="font-medium">
                                    {order.label}
                                  </EntityLink>
                                  {isPartialReady(order) ? (
                                    <span className="block text-[12px] text-[#9a6a00]">
                                      Va parcial
                                    </span>
                                  ) : null}
                                </td>
                                <td rowSpan={lines.length} className={cn(GRID_TD, 'align-top')}>
                                  <span className="block font-medium">{order.customer.name}</span>
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
                              {unitLabel(line.ready.unit)}
                            </td>
                            <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                              {formatDecimal(line.ready.quantity)}
                            </td>
                            {lineIndex === 0 ? (
                              <td rowSpan={lines.length} className="px-1 text-center align-top">
                                <button
                                  type="button"
                                  onClick={() => {
                                    set(
                                      'orderIds',
                                      form.orderIds.filter((id) => id !== order.id),
                                    );
                                  }}
                                  className="no-print mt-1 rounded p-1 text-ink-3 hover:bg-critical-soft hover:text-critical"
                                  title={`Quitar ${order.label} de la guía`}
                                >
                                  <Trash2 aria-hidden className="size-3.5" />
                                  <span className="sr-only">Quitar {order.label}</span>
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DocumentSection>

        {totals.length > 0 ? (
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
                    <td className={GRID_TD}>{total.name}</td>
                    <td className={cn(GRID_TD, 'text-ink-2')}>{unitLabel(total.quantity.unit)}</td>
                    <td className={cn(GRID_TD, 'pr-5 text-right font-semibold tabular-nums')}>
                      {formatDecimal(total.quantity.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DocumentSection>
        ) : null}
      </DocumentScreen>

      <LookupDialog
        open={adding}
        title="Agregar pedido por despachar"
        items={available}
        onPick={(item) => {
          set('orderIds', [...form.orderIds, item.id]);
          setAdding(false);
        }}
        onClose={() => {
          setAdding(false);
        }}
      />
    </>
  );
}
