import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  PackageSearch,
  Save,
  ShoppingCart,
  TriangleAlert,
  UserCheck,
  Wallet,
  WandSparkles,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction, useMonthlyPurchase } from '../../api/hooks';
import type { MonthlyPurchase } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import {
  Button,
  cn,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
} from '../../components/ui';
import {
  formatCop,
  formatCopShort,
  formatDecimal,
  isZero,
  monthLabel,
  parseDecimalInput,
  plural,
  roundUpDecimal,
  unitLabel,
} from '../../lib/format';
import { moneyInput } from './money';
import { PurchaseOrderDialog, type PurchaseDraftLine } from './purchase-order-dialog';

type PlanRow = MonthlyPurchase['products'][number];
type BuyRow = MonthlyPurchase['purchases'][number];

/** "2026-11" ± n months. */
function shiftMonth(month: string, delta: number): string {
  const [year = 2026, value = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 15));
  return date.toISOString().slice(0, 7);
}

/** "2026-10" → "octubre". */
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('es-CO', {
    month: 'long',
    timeZone: 'UTC',
  });
}

const display = (quantity: string) => formatDecimal(roundUpDecimal(quantity));

/**
 * Purchasing's month: how much of each product it expects to sell (starts with last month's sales,
 * the buyer adjusts it), and what that means in raw materials and resale goods to buy.
 */
export function MonthlyPlanPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const plan = useMonthlyPurchase(month);
  const shown = month ?? plan.data?.month;

  return (
    <>
      <PageHeader
        title={shown ? `Plan de compras de ${monthLabel(shown)}` : 'Plan de compras del mes'}
        description="Cuánto esperamos vender y, con las fórmulas, qué insumos y mercancía hay que comprar. Sin stock de seguridad: solo lo necesario."
        actions={
          shown ? (
            <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Mes anterior"
                icon={<ChevronLeft className="size-4" />}
                onClick={() => {
                  setMonth(shiftMonth(shown, -1));
                }}
              />
              <span className="flex min-w-36 items-center justify-center gap-1.5 px-2 text-sm font-medium capitalize">
                <CalendarRange aria-hidden className="size-4 text-ink-3" />
                {monthLabel(shown)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Mes siguiente"
                icon={<ChevronRight className="size-4" />}
                onClick={() => {
                  setMonth(shiftMonth(shown, 1));
                }}
              />
            </div>
          ) : null
        }
      />
      <QueryView query={plan}>{(data) => <MonthView key={data.month} data={data} />}</QueryView>
    </>
  );
}

function MonthView({ data }: { data: MonthlyPurchase }) {
  const planned = data.products.filter((row) => !isZero(row.plan.quantity));
  const toOrder = data.purchases.filter((row) => !isZero(row.suggested.quantity));
  const urgent = data.purchases.filter((row) => !isZero(row.urgent.quantity));
  const setters = [...new Set(data.products.map((row) => row.planSetBy).filter(Boolean))];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Productos en el plan"
          value={planned.length}
          icon={CalendarRange}
          tone="brand"
          hint={
            setters.length > 0
              ? `Fijado por ${setters.join(', ')}`
              : `Sugerido con lo vendido en ${monthName(data.basedOn)}`
          }
        />
        <Kpi
          label="Por pedir"
          value={toOrder.length}
          icon={ShoppingCart}
          hint="Insumos y mercancía con sugerencia de compra"
        />
        <Kpi
          label="Urgente"
          value={urgent.length}
          icon={TriangleAlert}
          tone={urgent.length > 0 ? 'critical' : 'good'}
          hint={urgent.length > 0 ? 'Faltan para pedidos ya vendidos' : 'Lo vendido está cubierto'}
        />
        <Kpi
          label="Costo estimado"
          value={
            <span title={formatCop(data.estimatedCost)}>{formatCopShort(data.estimatedCost)}</span>
          }
          icon={Wallet}
          hint="Lo sugerido al costo del catálogo, antes de IVA"
        />
      </div>

      <SalesPlan data={data} />
      <WhatToBuy data={data} />
    </div>
  );
}

// --- the sales plan -----------------------------------------------------------------------------

function SalesPlan({ data }: { data: MonthlyPurchase }) {
  const { can } = useSession();
  const canWrite = can('purchasing:write');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const valueOf = (row: PlanRow) => drafts[row.product.id] ?? display(row.plan.quantity);
  const parsedOf = (row: PlanRow) => {
    const raw = valueOf(row);
    return raw.trim() === '' ? '0' : parseDecimalInput(raw);
  };
  const edited = (row: PlanRow) => {
    const parsed = parsedOf(row);
    return (
      parsed !== null && parsed !== roundUpDecimal(row.plan.quantity) && row.product.id in drafts
    );
  };
  const invalid = data.products.some((row) => parsedOf(row) === null);
  const dirty = data.products.some(edited);
  const suggestions = data.products.filter((row) => row.planSetBy === null).length;
  const last = monthName(data.basedOn);

  const fill = (pick: (row: PlanRow) => string) => {
    setDrafts(Object.fromEntries(data.products.map((row) => [row.product.id, display(pick(row))])));
  };

  const save = useAction(
    () =>
      api.put(`/v1/purchase-plans/${data.month}`, {
        lines: data.products.map((row) => ({
          productId: row.product.id,
          quantity: parsedOf(row) ?? '0',
        })),
      }),
    { success: `Plan de ${monthLabel(data.month)} guardado: la compra sugerida ya se recalculó` },
  );

  return (
    <Panel
      title="Cuánto vamos a vender"
      description={`Arranca con lo vendido en ${last}; ajústalo con lo que sabes del mes (temporada, clientes nuevos, promociones).`}
      actions={
        canWrite ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fill((row) => row.lastMonth.quantity);
              }}
            >
              Usar lo de {last}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fill((row) => row.average3.quantity);
              }}
            >
              Usar el promedio
            </Button>
            <Button
              size="sm"
              icon={<Save className="size-3.5" />}
              loading={save.isPending}
              disabled={invalid || (!dirty && suggestions === 0)}
              onClick={() => {
                save.mutate(undefined, {
                  onSuccess: () => {
                    setDrafts({});
                  },
                });
              }}
            >
              Guardar plan
            </Button>
          </>
        ) : null
      }
      flush
    >
      <DataTable<PlanRow>
        label="Plan de ventas del mes"
        rows={data.products}
        rowKey={(row) => row.product.id}
        empty={<EmptyState icon={<PackageSearch />} title="No hay productos activos para vender" />}
        columns={[
          {
            key: 'product',
            header: 'Producto',
            render: (row) => <ProductCell product={row.product} detail={row.typeLabel} />,
          },
          {
            key: 'lastMonth',
            header: `Vendido en ${last}`,
            align: 'right',
            render: (row) => <Qty value={row.lastMonth} dimZero />,
          },
          {
            key: 'average',
            header: 'Promedio 3 meses',
            align: 'right',
            render: (row) => <Qty value={row.average3} dimZero />,
          },
          {
            key: 'plan',
            header: 'Plan del mes',
            align: 'right',
            render: (row) => {
              const changed = edited(row);
              const bad = parsedOf(row) === null;
              return (
                <span className="inline-flex flex-col items-end gap-1">
                  {canWrite ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Input
                        aria-label={`Plan de ${row.product.name}`}
                        aria-invalid={bad || undefined}
                        inputMode="decimal"
                        value={valueOf(row)}
                        className={cn(
                          'h-9 w-28 text-right tabular-nums',
                          changed && 'border-brand bg-brand-soft/40',
                        )}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDrafts((current) => ({ ...current, [row.product.id]: value }));
                        }}
                      />
                      <span className="w-7 text-left text-[12.5px] text-ink-3">
                        {unitLabel(row.plan.unit)}
                      </span>
                    </span>
                  ) : (
                    <Qty value={row.plan} emphasis />
                  )}
                  <PlanSource row={row} changed={changed} />
                </span>
              );
            },
          },
        ]}
      />
      {canWrite ? (
        <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
          Al guardar, todas las cantidades quedan fijadas a tu nombre y la compra sugerida se
          recalcula con ellas.
          {suggestions > 0
            ? ` Hoy ${plural(suggestions, 'producto sigue', 'productos siguen')} con la sugerencia automática.`
            : ''}
        </p>
      ) : null}
    </Panel>
  );
}

function PlanSource({ row, changed }: { row: PlanRow; changed: boolean }) {
  if (changed) return <span className="text-[12px] font-medium text-brand">Sin guardar</span>;
  if (row.planSetBy) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
        <UserCheck aria-hidden className="size-3.5 text-good" />
        Fijado por {row.planSetBy}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
      <WandSparkles aria-hidden className="size-3.5" />
      Sugerencia
    </span>
  );
}

// --- what to buy ----------------------------------------------------------------------------------

function WhatToBuy({ data }: { data: MonthlyPurchase }) {
  const { can } = useSession();
  const canWrite = can('purchasing:write');
  const [scope, setScope] = useState<'order' | 'all'>('order');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<PurchaseDraftLine[] | null>(null);
  const orderable = data.purchases.filter((row) => !isZero(row.suggested.quantity));
  const rows = scope === 'order' ? orderable : data.purchases;
  const selectedCost = data.purchases
    .filter((row) => selected.has(row.product.id))
    .reduce((sum, row) => sum + BigInt(row.estimatedCost), 0n);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <Panel
      title="Qué comprar"
      description={
        <>
          Lo planeado para {monthName(data.month)} (de entrada, lo vendido en{' '}
          {monthName(data.basedOn)}) convertido a insumos con las fórmulas, menos lo que hay en
          bodega y lo que viene en camino.
        </>
      }
      actions={
        <>
          <Segmented
            label="Mostrar"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'order', label: `Por pedir · ${String(orderable.length)}` },
              { value: 'all', label: `Todo · ${String(data.purchases.length)}` },
            ]}
          />
          {canWrite ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(
                  selected.size === orderable.length
                    ? new Set()
                    : new Set(orderable.map((row) => row.product.id)),
                );
              }}
            >
              {selected.size === orderable.length && orderable.length > 0
                ? 'Quitar selección'
                : 'Seleccionar lo sugerido'}
            </Button>
          ) : null}
        </>
      }
      flush
    >
      <div className="flex flex-col gap-3 border-b border-line bg-surface-2/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="text-ink-2">Total estimado del mes</span>{' '}
          <strong className="ml-1 text-lg tabular-nums">{formatCop(data.estimatedCost)}</strong>
          <span className="ml-1 text-[12.5px] text-ink-3">antes de IVA</span>
        </p>
        {canWrite ? (
          <Button
            icon={<ShoppingCart className="size-4" />}
            disabled={selected.size === 0}
            onClick={() => {
              setDraft(
                data.purchases
                  .filter((row) => selected.has(row.product.id))
                  .map((row) => ({
                    productId: row.product.id,
                    quantity: display(row.suggested.quantity),
                    unitCost: moneyInput(row.unitCost),
                  })),
              );
            }}
          >
            {selected.size > 0
              ? `Crear orden de compra · ${plural(selected.size, 'producto', 'productos')} · ${formatCopShort(selectedCost.toString())}`
              : 'Crear orden de compra'}
          </Button>
        ) : null}
      </div>

      <DataTable<BuyRow>
        label="Qué comprar"
        rows={rows}
        rowKey={(row) => row.product.id}
        rowClassName={(row) => (isZero(row.suggested.quantity) ? 'text-ink-2' : undefined)}
        empty={
          <EmptyState
            icon={<CircleCheck />}
            title="No hay nada por pedir este mes"
            description="Lo que hay en bodega y lo que viene en camino alcanza para el plan."
          />
        }
        columns={[
          {
            key: 'product',
            header: 'Insumo o mercancía',
            render: (row) => (
              <span className="flex items-start gap-3">
                {canWrite ? (
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${row.product.name}`}
                    className="mt-1 size-4 shrink-0 accent-[#003858]"
                    disabled={isZero(row.suggested.quantity)}
                    checked={selected.has(row.product.id)}
                    onChange={(event) => {
                      toggle(row.product.id, event.target.checked);
                    }}
                  />
                ) : null}
                <ProductCell product={row.product} detail={row.typeLabel} />
              </span>
            ),
          },
          {
            key: 'need',
            header: 'Necesidad del mes',
            align: 'right',
            render: (row) => <Qty value={row.monthNeed} dimZero />,
          },
          {
            key: 'onHand',
            header: 'En bodega',
            align: 'right',
            render: (row) => <Qty value={row.onHand} dimZero />,
          },
          {
            key: 'onOrder',
            header: 'En tránsito',
            align: 'right',
            render: (row) => <Qty value={row.onOrder} dimZero />,
          },
          {
            key: 'urgent',
            header: 'Urgente',
            align: 'right',
            render: (row) =>
              isZero(row.urgent.quantity) ? (
                <span className="text-ink-3">—</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-critical">
                  <TriangleAlert aria-hidden className="size-3.5" />
                  <Qty value={row.urgent} />
                </span>
              ),
          },
          {
            key: 'suggested',
            header: 'Sugerido',
            align: 'right',
            render: (row) => <Qty value={row.suggested} emphasis dimZero />,
          },
          {
            key: 'cost',
            header: 'Costo estimado',
            align: 'right',
            render: (row) => (
              <span>
                {isZero(row.estimatedCost) ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  formatCop(row.estimatedCost)
                )}
                <span className="block text-[12px] text-ink-3">
                  {row.unitCost
                    ? `${formatCop(row.unitCost)} / ${unitLabel(row.suggested.unit)}`
                    : 'Sin costo en el catálogo'}
                </span>
              </span>
            ),
          },
          {
            key: 'usedBy',
            header: 'Para',
            hideOnMobile: true,
            render: (row) =>
              row.usedBy.length === 0 ? (
                <span className="text-ink-3">{row.type === 'RESALE' ? 'Reventa' : '—'}</span>
              ) : (
                <span className="flex flex-wrap gap-x-2 text-[13px] text-ink-2">
                  {row.usedBy.slice(0, 4).map((product) => (
                    <EntityLink key={product.id} to="product" id={product.id}>
                      <span title={product.name}>{product.code}</span>
                    </EntityLink>
                  ))}
                  {row.usedBy.length > 4 ? (
                    <span className="text-ink-3">+{row.usedBy.length - 4}</span>
                  ) : null}
                </span>
              ),
          },
        ]}
      />
      <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
        Urgente es lo que ya falta para pedidos vendidos; el sugerido es el mayor entre eso y la
        necesidad del mes. La mercancía de reventa se compra tal cual se vende.
      </p>

      {draft ? (
        <PurchaseOrderDialog
          initial={draft}
          description={`Para el plan de ${monthLabel(data.month)}. Ajusta cantidades y costos con lo que cotizó el proveedor.`}
          onClose={() => {
            setDraft(null);
          }}
          onCreated={() => {
            setSelected(new Set());
          }}
        />
      ) : null}
    </Panel>
  );
}
