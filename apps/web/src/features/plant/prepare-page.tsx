import { CircleCheck, Factory, PackageCheck, PackageOpen, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import {
  useAction,
  useOrder,
  useOrderCoverage,
  useOrders,
  useProductionNeeds,
  useStockStatus,
  useWarehouses,
} from '../../api/hooks';
import type { OrderCoverage, PackagingNeed, SalesOrder } from '../../api/types';
import { useProfile, useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, OrderStatusChip } from '../../components/status';
import { cn, QueryView } from '../../components/ui';
import { formatDateTime, formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';
import {
  combineQueries,
  ConfirmDialog,
  DateCell,
  DocumentNotice,
  GRID_HEAD,
  GRID_TD,
  GRID_TH,
  neighbors,
  QtyTotal,
  SELECT,
} from '../inventory/erp-kit';
import { compareDecimals, isPositive } from './decimal';
import {
  buildPrepOrder,
  buildPrepOrders,
  type PrepLine,
  readiness,
  READINESS_LABEL,
} from './preparation';

const PREPARABLE = new Set(['INVOICED', 'PARTIAL']);

export function PreparePage() {
  const { id } = useParams();
  const order = useOrder(id);
  const coverage = useOrderCoverage();
  const list = useOrders({ status: 'INVOICED,PARTIAL', limit: '500' });
  const ids = useMemo(
    () =>
      list.data && coverage.data
        ? buildPrepOrders(list.data, coverage.data).map((row) => row.order.id)
        : undefined,
    [list.data, coverage.data],
  );
  return (
    <QueryView query={combineQueries(order, coverage)}>
      {() =>
        order.data && coverage.data ? (
          <PrepareDocument
            key={`${order.data.id}-${order.data.status}-${order.data.readyAt ?? ''}`}
            order={order.data}
            coverage={coverage.data.find((entry) => entry.orderId === order.data.id)}
            ids={ids}
          />
        ) : null
      }
    </QueryView>
  );
}

function PrepareDocument({
  order,
  coverage,
  ids,
}: {
  order: SalesOrder;
  coverage: OrderCoverage | undefined;
  ids: string[] | undefined;
}) {
  const navigate = useNavigate();
  const profile = useProfile();
  const { can } = useSession();
  const prep = useMemo(() => buildPrepOrder(order, coverage), [order, coverage]);
  const needs = useProductionNeeds();
  const packaging = useMemo(
    () => new Map((needs.data?.packaging ?? []).map((need) => [need.product.id, need])),
    [needs.data],
  );
  const preparable = PREPARABLE.has(order.status) && prep.lines.length > 0;
  const editable = preparable && order.allowPartial && can('sales-orders:prepare');
  const initial = useMemo(
    () =>
      Object.fromEntries(
        prep.lines.map((line) => [
          line.productId,
          formatDecimal(order.allowPartial ? line.available.quantity : line.pending.quantity),
        ]),
      ),
    [prep.lines, order.allowPartial],
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const warehouses = useWarehouses();
  const stock = useStockStatus();
  const [chosenWarehouse, setWarehouse] = useState('');
  // Where the goods are: by default the first warehouse that has everything pending, else the first one.
  const inWarehouse = (productId: string, code: string) =>
    stock.data
      ?.find((row) => row.productId === productId)
      ?.byWarehouse.find((entry) => entry.warehouseCode === code)?.onHand.quantity ?? '0';
  const suggested =
    (warehouses.data ?? []).find((item) =>
      prep.lines.every(
        (line) =>
          compareDecimals(inWarehouse(line.productId, item.code), line.pending.quantity) >= 0,
      ),
    )?.code ??
    warehouses.data?.[0]?.code ??
    '';
  const warehouse = chosenWarehouse || suggested;
  const warehouseName = warehouses.data?.find((item) => item.code === warehouse)?.name ?? '';
  const draft = useDraft(`prepare.${order.id}`, values, { enabled: editable });
  useWorkTab(`Alistamiento ${order.label} · ${order.customer.name}`);

  const parsed = prep.lines.map((line) => {
    const raw = values[line.productId] ?? '';
    const quantity = raw.trim() === '' ? '0' : parseDecimalInput(raw);
    const unit = unitLabel(line.pending.unit);
    let error: string | undefined;
    if (quantity === null) error = 'Escribe una cantidad válida (por ejemplo 120 o 2,5).';
    else if (compareDecimals(quantity, line.pending.quantity) > 0)
      error = `De ${line.code} quedan ${formatDecimal(line.pending.quantity)} ${unit} por despachar.`;
    else if (!order.allowPartial && compareDecimals(quantity, line.pending.quantity) !== 0)
      error = 'Este pedido se despacha completo.';
    const overStock =
      quantity !== null && compareDecimals(quantity, line.available.quantity) > 0 && !error;
    return { line, quantity, error, overStock };
  });
  const valid =
    parsed.every((item) => !item.error) &&
    parsed.some((item) => item.quantity !== null && isPositive(item.quantity));
  const complete = parsed.every(
    (item) =>
      item.quantity !== null && compareDecimals(item.quantity, item.line.pending.quantity) === 0,
  );
  const blockedWhole = preparable && !order.allowPartial && !prep.complete;
  const canHand = preparable && can('sales-orders:prepare') && valid && !blockedWhole;
  const handed = parsed.filter((item) => item.quantity !== null && isPositive(item.quantity));

  const prepare = useAction(
    () =>
      api.post<SalesOrder>(`/v1/sales-orders/${order.id}/prepare`, {
        ...(warehouse ? { warehouse } : {}),
        // Every line goes explicitly when it is partial: a line left out would be separated complete.
        ...(complete
          ? {}
          : {
              lines: parsed.map((item) => ({
                productId: item.line.productId,
                quantity: item.quantity ?? '0',
              })),
            }),
      }),
    {
      success: (result) =>
        complete
          ? `${result.label} alistado completo en ${warehouseName}`
          : `${result.label}: lo disponible quedó alistado en ${warehouseName}`,
    },
  );

  const kind = readiness(prep);
  const nav = neighbors(ids, order.id, (value) => `/planta/alistar/${value}`);

  return (
    <>
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setValues(restored);
          }}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind="Alistamiento de pedido"
        number={order.label}
        status={
          <>
            <OrderStatusChip status={order.status} />
            {preparable ? (
              <Chip
                tone={kind === 'complete' ? 'good' : kind === 'partial' ? 'warning' : 'critical'}
                icon={
                  kind === 'complete' ? CircleCheck : kind === 'partial' ? PackageOpen : Factory
                }
              >
                {READINESS_LABEL[kind]}
              </Chip>
            ) : null}
          </>
        }
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Entregar a despacho',
                icon: PackageCheck,
                shortcut: 'F9',
                primary: true,
                hidden: !preparable || !can('sales-orders:prepare'),
                disabled: !canHand,
                ...(blockedWhole
                  ? { title: 'Se despacha completo: espera a que se fabrique lo que falta' }
                  : {}),
                onClick: () => {
                  setTouched(new Set(prep.lines.map((line) => line.productId)));
                  if (canHand) setConfirming(true);
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
            closeTo="/planta"
          />
        }
        notes={
          order.notes ? (
            <>
              <span className="mb-0.5 block text-[12px] font-medium text-ink-3">
                Observaciones del pedido
              </span>
              <span className="whitespace-pre-line">{order.notes}</span>
            </>
          ) : (
            <span className="text-ink-3">Sin observaciones.</span>
          )
        }
        totals={[
          { label: 'Productos pendientes', value: prep.lines.length },
          {
            label: 'Pendiente por despachar',
            value: <QtyTotal values={prep.lines.map((line) => line.pending)} />,
          },
          {
            label: 'Entrega a despacho',
            value: (
              <QtyTotal
                values={handed.map((item) => ({
                  quantity: item.quantity ?? '0',
                  unit: item.line.pending.unit,
                }))}
              />
            ),
            strong: true,
          },
        ]}
        signatures={[
          { label: 'Facturó', name: order.invoicedBy, at: formatDateTime(order.invoicedAt) },
          {
            label: 'Alistó',
            name: preparable ? profile.fullName : order.readyBy,
            at: order.readyAt && !preparable ? formatDateTime(order.readyAt) : null,
          },
          { label: 'Recibió en despacho', name: null },
        ]}
      >
        {!preparable ? (
          <DocumentNotice tone="info">
            Este pedido ya no está por alistar: está en estado «{order.statusLabel}». Se muestra
            solo para consulta.
          </DocumentNotice>
        ) : blockedWhole ? (
          <DocumentNotice>
            Facturación no autorizó despacho parcial: este pedido sale completo. Espera a que se
            fabrique lo que falta (columna Observación).
          </DocumentNotice>
        ) : order.allowPartial && !prep.complete ? (
          <DocumentNotice>
            Despacho parcial autorizado: las cantidades vienen con lo que cubre el stock hoy. Lo que
            no entregues queda pendiente y sale en otra guía.
          </DocumentNotice>
        ) : null}

        <HeaderGrid>
          <HeaderField label="Pedido">
            <EntityLink to="order" id={order.id} className="font-medium">
              {order.label}
            </EntityLink>
          </HeaderField>
          <HeaderField label="Cliente" span={2}>
            <span className="text-ink-3 tabular-nums">
              {order.customer.documentType} {order.customer.documentNumber}
            </span>{' '}
            <EntityLink to="customer" id={order.customer.id} className="font-medium">
              {order.customer.name}
            </EntityLink>
          </HeaderField>
          <HeaderField label="Vendedor">{order.seller.name}</HeaderField>
          <HeaderField label="Sucursal de entrega" span={2}>
            {order.branch.name}
            <span className="text-ink-2">
              {order.branch.address ? ` · ${order.branch.address}` : ''}
              {order.branch.city ? `, ${order.branch.city}` : ''}
            </span>
          </HeaderField>
          <HeaderField label="Prioridad">
            {order.priority !== null ? (
              <span className="font-semibold tabular-nums">{order.priority}</span>
            ) : (
              <span className="text-ink-3">Sin prioridad</span>
            )}
          </HeaderField>
          <HeaderField label="Fecha prometida">
            <DateCell
              date={order.estimatedDeliveryDate}
              pending={preparable}
              lateLabel="Atrasado"
            />
          </HeaderField>
          <HeaderField label="Alistar desde" htmlFor="prepare-warehouse">
            <select
              id="prepare-warehouse"
              className={cn(SELECT, 'w-full')}
              value={warehouse}
              disabled={!preparable}
              onChange={(event) => {
                setWarehouse(event.target.value);
              }}
            >
              {(warehouses.data ?? []).map((item) => (
                <option key={item.id} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </HeaderField>
          <HeaderField label="Despacho parcial">
            {order.allowPartial ? 'Sí, autorizado por facturación' : 'No, sale completo'}
          </HeaderField>
          <HeaderField label="Facturado">
            {formatDateTime(order.invoicedAt)}
            {order.invoicedBy ? <span className="text-ink-2"> · {order.invoicedBy}</span> : null}
          </HeaderField>
        </HeaderGrid>

        <DocumentSection title="Productos a alistar" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                  <th className={cn(GRID_TH, 'w-24')}>Código</th>
                  <th className={GRID_TH}>Descripción</th>
                  <th className={cn(GRID_TH, 'w-12')}>Und</th>
                  <th className={cn(GRID_TH, 'text-right')}>Pedido</th>
                  <th className={cn(GRID_TH, 'text-right')}>Despachado</th>
                  <th className={cn(GRID_TH, 'text-right')}>Pendiente</th>
                  <th className={cn(GRID_TH, 'text-right')}>Cubre hoy</th>
                  <th className={cn(GRID_TH, 'text-right')}>En la bodega</th>
                  <th className={cn(GRID_TH, 'w-32 text-right')}>A entregar</th>
                  <th className={GRID_TH}>Observación</th>
                </tr>
              </thead>
              <tbody>
                {parsed.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-ink-3">
                      Nada pendiente por despachar en este pedido.
                    </td>
                  </tr>
                ) : (
                  parsed.map(({ line, error, overStock }, index) => {
                    const showError = error && touched.has(line.productId);
                    return (
                      <tr
                        key={line.productId}
                        className={cn('border-b border-line', showError && 'bg-critical-soft/40')}
                      >
                        <td className={cn(GRID_TD, 'text-center text-ink-3 tabular-nums')}>
                          {index + 1}
                        </td>
                        <td className={cn(GRID_TD, 'tabular-nums')}>{line.code}</td>
                        <td className={GRID_TD}>
                          <EntityLink to="product" id={line.productId}>
                            {line.name}
                          </EntityLink>
                        </td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>
                          {unitLabel(line.pending.unit)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                          {formatDecimal(line.ordered.quantity)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right text-ink-2 tabular-nums')}>
                          {formatDecimal(line.dispatched.quantity)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                          {formatDecimal(line.pending.quantity)}
                        </td>
                        <td
                          className={cn(
                            GRID_TD,
                            'text-right tabular-nums',
                            isPositive(line.missing.quantity) ? 'text-critical' : 'text-good',
                          )}
                        >
                          {formatDecimal(line.available.quantity)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right tabular-nums text-ink-2')}>
                          {formatDecimal(inWarehouse(line.productId, warehouse))}
                        </td>
                        <td className="px-1 py-0.5 text-right">
                          {editable ? (
                            <>
                              <input
                                value={values[line.productId] ?? ''}
                                inputMode="decimal"
                                aria-label={`Cantidad a entregar de ${line.code}`}
                                aria-invalid={showError ? true : undefined}
                                className="h-8 w-full rounded-[4px] border border-line-strong bg-surface px-2 text-right text-[13.5px] font-semibold tabular-nums focus:border-brand aria-invalid:border-critical print:hidden"
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setValues((current) => ({ ...current, [line.productId]: value }));
                                }}
                                onBlur={() => {
                                  setTouched((current) => new Set(current).add(line.productId));
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter') return;
                                  event.preventDefault();
                                  const inputs = [
                                    ...document.querySelectorAll<HTMLInputElement>(
                                      '[data-prepare-qty]',
                                    ),
                                  ];
                                  const position = inputs.indexOf(event.currentTarget);
                                  inputs[position + 1]?.focus();
                                  inputs[position + 1]?.select();
                                }}
                                data-prepare-qty
                              />
                              <span className="hidden px-2 font-semibold tabular-nums print:inline">
                                {values[line.productId]}
                              </span>
                            </>
                          ) : (
                            <span className="px-2 font-semibold tabular-nums">
                              {preparable ? formatDecimal(line.pending.quantity) : '—'}
                            </span>
                          )}
                        </td>
                        <td className={cn(GRID_TD, 'text-[12.5px]')}>
                          {showError ? (
                            <span className="font-medium text-critical">{error}</span>
                          ) : (
                            <Observation
                              line={line}
                              need={packaging.get(line.productId)}
                              overStock={overStock}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DocumentSection>
      </DocumentScreen>

      <ConfirmDialog
        open={confirming}
        title={
          complete
            ? `¿Entregar ${order.label} completo a despacho?`
            : `¿Entregar a despacho una parte de ${order.label}?`
        }
        description={
          complete
            ? 'Logística lo podrá incluir en la próxima guía.'
            : 'Lo que no entregas ahora queda pendiente en el pedido y sale en otra guía cuando se fabrique.'
        }
        confirmLabel="Entregar a despacho"
        loading={prepare.isPending}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          prepare.mutate(undefined, {
            onSuccess: () => {
              draft.clear();
              setConfirming(false);
              void navigate('/planta');
            },
          });
        }}
      >
        <table className="w-full text-[13.5px]">
          <tbody>
            {handed.map((item) => (
              <tr key={item.line.productId} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 text-ink-3 tabular-nums">{item.line.code}</td>
                <td className="py-1.5 pr-3">{item.line.name}</td>
                <td className="py-1.5 text-right font-semibold">
                  <Qty value={{ quantity: item.quantity ?? '0', unit: item.line.pending.unit }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ConfirmDialog>
    </>
  );
}

/** Why a line is short and who is solving it (packaging in plant, or purchasing for resale goods). */
function Observation({
  line,
  need,
  overStock,
}: {
  line: PrepLine;
  need: PackagingNeed | undefined;
  overStock: boolean;
}) {
  if (overStock) {
    return <span className="text-[#9a6a00]">Entregas más de lo que cubre el stock hoy.</span>;
  }
  if (!isPositive(line.missing.quantity)) {
    return <span className="text-good">Completo en stock</span>;
  }
  const missing = `Faltan ${formatDecimal(line.missing.quantity)} ${unitLabel(line.missing.unit)}`;
  if (!need) {
    return (
      <span>
        <span className="font-medium text-critical">{missing}</span>
        <span className="text-ink-2">
          {line.coverage?.status === 'SHORT'
            ? ' · compras debe conseguirlo'
            : ' · llega con lo que está en producción'}
        </span>
      </span>
    );
  }
  return (
    <span>
      <span className="font-medium text-critical">{missing}</span>
      <span className="text-ink-2">
        {' '}
        · envasado programado {formatDecimal(need.planned.quantity)}
        {isPositive(need.pendingToSchedule.quantity)
          ? ` · falta programar ${formatDecimal(need.pendingToSchedule.quantity)}`
          : ''}
      </span>
    </span>
  );
}
