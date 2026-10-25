import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Clock,
  Factory,
  PackageCheck,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  useOrderCoverage,
  useOversell,
  useProductionNeeds,
  useProductionOrders,
  usePurchaseNeeds,
  usePurchaseOrders,
  useSummary,
} from '../../api/hooks';
import type { CoverageStatus, OrderCoverage, OversellRow, PurchaseNeed } from '../../api/types';
import { CoverageGauge } from '../../components/coverage-gauge';
import { Kpi } from '../../components/kpi';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, COVERAGE, CoverageChip, DueDate } from '../../components/status';
import { cn, EmptyState, PageHeader, Panel, QueryView, Segmented } from '../../components/ui';
import { daysUntil, isZero, plural } from '../../lib/format';

const today = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());

const isLate = (date: string | null) => (daysUntil(date) ?? 0) < 0;

/**
 * Management view, ordered by what needs attention: deliveries at risk first, then what is holding
 * them up (materials, late purchases, late production), then the oversell report and the sellers.
 * Whatever is covered stays folded away.
 */
export function SummaryPage() {
  const coverage = useOrderCoverage();
  return (
    <>
      <PageHeader
        title="Resumen"
        description={`Hoy, ${today}: cómo va lo vendido y qué hay que mover para cumplirlo.`}
      />
      <QueryView query={coverage}>{(rows) => <Dashboard orders={rows} />}</QueryView>
    </>
  );
}

function Dashboard({ orders }: { orders: OrderCoverage[] }) {
  const atRisk = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'SHORT' || isLate(order.estimatedDeliveryDate))
        .sort(
          (a, b) =>
            Number(isLate(b.estimatedDeliveryDate)) - Number(isLate(a.estimatedDeliveryDate)) ||
            a.priority - b.priority,
        ),
    [orders],
  );

  return (
    <div className="flex flex-col gap-6">
      <Headline orders={orders} atRisk={atRisk} />
      <Kpis orders={orders} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <AttentionPanel atRisk={atRisk} />
        <div className="flex min-w-0 flex-col gap-6">
          <BlockersPanel atRisk={atRisk} />
          <DelaysPanel />
        </div>
      </div>
      <OversellPanel />
      <SellersPanel orders={orders} />
    </div>
  );
}

// --- headline -----------------------------------------------------------------------------------

/** The one figure the view leads with, next to the coverage of every confirmed order. */
function Headline({ orders, atRisk }: { orders: OrderCoverage[]; atRisk: OrderCoverage[] }) {
  const late = atRisk.filter((order) => isLate(order.estimatedDeliveryDate)).length;
  const short = atRisk.filter((order) => order.status === 'SHORT').length;
  return (
    <section
      className={cn(
        'grid gap-6 rounded-[10px] border bg-surface p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center',
        atRisk.length > 0 ? 'border-critical/25' : 'border-line',
      )}
    >
      {atRisk.length > 0 ? (
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <TriangleAlert aria-hidden className="size-4 text-critical" />
            Entregas en riesgo
          </p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-[56px] leading-none font-semibold tracking-[-0.03em] [font-stretch:105%]">
              {atRisk.length}
            </span>
            <span className="text-lg text-ink-2">
              de {plural(orders.length, 'preventa confirmada', 'preventas confirmadas')}
            </span>
          </p>
          <p className="mt-2 text-[15px] text-ink-2">
            {[
              late > 0 ? plural(late, 'atrasada', 'atrasadas') : null,
              short > 0 ? `${String(short)} con insumos que no alcanzan` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            .
          </p>
          <Link
            to="/compras"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Ver qué comprar
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-0.5 size-6 text-good" />
          <div>
            <p className="text-lg font-semibold">Todo lo confirmado se puede cumplir a tiempo</p>
            <p className="mt-1 text-[15px] text-ink-2">
              Hay stock o insumos para las {orders.length} preventas confirmadas.
            </p>
          </div>
        </div>
      )}
      <CoverageDistribution orders={orders} />
    </section>
  );
}

/** Confirmed orders split by coverage: a single stacked bar with its legend. */
function CoverageDistribution({ orders }: { orders: OrderCoverage[] }) {
  const statuses: CoverageStatus[] = ['COVERED', 'NEEDS_PRODUCTION', 'SHORT'];
  const counts = statuses.map((status) => ({
    status,
    count: orders.filter((order) => order.status === status).length,
  }));
  const total = Math.max(orders.length, 1);
  const fills: Record<CoverageStatus, string> = {
    COVERED: 'bg-good',
    NEEDS_PRODUCTION: 'bg-warning',
    SHORT: 'bg-critical',
  };
  const visible = counts.filter((entry) => entry.count > 0);
  return (
    <div>
      <p className="mb-3 text-[13px] font-medium text-ink-2">
        Cobertura de las preventas confirmadas
      </p>
      <div
        className="flex h-4 gap-[2px] overflow-hidden rounded-[4px] bg-surface-2"
        role="img"
        aria-label={counts
          .map((entry) => `${COVERAGE[entry.status].label}: ${String(entry.count)}`)
          .join(', ')}
      >
        {visible.map((entry, index) => (
          <div
            key={entry.status}
            title={`${COVERAGE[entry.status].label}: ${String(entry.count)}`}
            className={cn(
              fills[entry.status],
              index === 0 && 'rounded-l-[4px]',
              index === visible.length - 1 && 'rounded-r-[4px]',
            )}
            style={{ width: `${String((entry.count / total) * 100)}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-x-6 gap-y-2 text-sm sm:flex-row sm:flex-wrap">
        {counts.map((entry) => (
          <li key={entry.status} className="flex items-center gap-2 whitespace-nowrap">
            <span aria-hidden className={cn('size-2.5 rounded-[2px]', fills[entry.status])} />
            <span className="text-ink-2">{COVERAGE[entry.status].label}</span>
            <span className="font-semibold tabular-nums">{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- KPIs ---------------------------------------------------------------------------------------

function Kpis({ orders }: { orders: OrderCoverage[] }) {
  const summary = useSummary();
  const production = useProductionNeeds();
  const planned = useProductionOrders('PLANNED');
  const purchases = usePurchaseOrders('OPEN');

  const toSchedule = production.data
    ? [...production.data.packaging, ...production.data.bulk].filter(
        (need) => !isZero(need.pendingToSchedule.quantity),
      ).length
    : undefined;
  const lateProduction = (planned.data ?? []).filter((order) => isLate(order.scheduledDate)).length;
  const latePurchases = (purchases.data ?? []).filter((order) => isLate(order.expectedDate)).length;
  const ready = orders.filter((order) => order.status === 'COVERED');
  const readyLate = ready.filter((order) => isLate(order.estimatedDeliveryDate)).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Listas para despachar"
        value={ready.length}
        icon={PackageCheck}
        tone={readyLate > 0 ? 'critical' : 'good'}
        hint={
          readyLate > 0
            ? `${plural(readyLate, 'ya pasó', 'ya pasaron')} su fecha: hay stock`
            : 'Cubiertas con producto en bodega'
        }
        to="/inventario?vista=por-despachar"
      />
      <Kpi
        label="Por programar en planta"
        value={toSchedule ?? '—'}
        icon={Factory}
        tone={lateProduction > 0 ? 'critical' : toSchedule ? 'warning' : 'good'}
        hint={
          lateProduction > 0
            ? `${plural(lateProduction, 'orden atrasada', 'órdenes atrasadas')} · ${String(planned.data?.length ?? 0)} programadas`
            : plural(planned.data?.length ?? 0, 'orden programada', 'órdenes programadas')
        }
        to="/planta"
      />
      <Kpi
        label="Insumos por comprar"
        value={summary.data?.materialsToBuy ?? '—'}
        icon={ShoppingCart}
        tone={summary.data?.materialsToBuy ? 'critical' : 'good'}
        hint={
          latePurchases > 0
            ? `${plural(purchases.data?.length ?? 0, 'compra', 'compras')} en camino · ${String(latePurchases)} atrasada${latePurchases === 1 ? '' : 's'}`
            : `${plural(purchases.data?.length ?? 0, 'compra', 'compras')} en camino, ya descontadas`
        }
        to="/compras"
      />
      <Kpi
        label="Borradores de ventas"
        value={summary.data?.draftOrders ?? '—'}
        icon={CircleDashed}
        tone="neutral"
        hint="No cuentan hasta que se confirmen"
        to="/ventas"
      />
    </div>
  );
}

// --- attention ----------------------------------------------------------------------------------

function AttentionPanel({ atRisk }: { atRisk: OrderCoverage[] }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? atRisk : atRisk.slice(0, 8);
  return (
    <Panel
      title="Atención hoy"
      description="Preventas atrasadas o sin insumos suficientes; primero las atrasadas."
      flush
    >
      {atRisk.length === 0 ? (
        <EmptyState
          icon={<CircleCheck />}
          title="Nada en riesgo"
          description="Ninguna preventa está atrasada ni le faltan insumos."
        />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {rows.map((order) => (
              <li
                key={order.orderId}
                className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <EntityLink to="order" id={order.orderId} className="font-medium">
                      {order.label}
                    </EntityLink>
                    <EntityLink to="customer" id={order.customerId} className="truncate">
                      {order.customerName}
                    </EntityLink>
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-3">
                    {order.seller.name} ·{' '}
                    {order.lines
                      .filter((line) => line.status === 'SHORT')
                      .map((line) => line.product.name)
                      .join(', ') || order.lines.map((line) => line.product.code).join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] sm:justify-end">
                  <DueDate date={order.estimatedDeliveryDate} />
                  <CoverageChip status={order.status} />
                </div>
              </li>
            ))}
          </ul>
          {atRisk.length > 8 ? (
            <button
              type="button"
              onClick={() => {
                setShowAll((value) => !value);
              }}
              className="w-full border-t border-line px-5 py-3 text-left text-sm font-medium text-brand hover:bg-surface-2/60"
            >
              {showAll ? 'Ver menos' : `Ver las ${String(atRisk.length)}`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** Materials to buy, ranked by how many at-risk orders wait on them. */
function BlockersPanel({ atRisk }: { atRisk: OrderCoverage[] }) {
  const needs = usePurchaseNeeds();
  return (
    <Panel
      title="Qué frena las entregas"
      description="Insumos por comprar, primero los que detienen más preventas."
      actions={
        <Link to="/compras" className="text-sm font-medium text-brand hover:underline">
          Ir a compras
        </Link>
      }
      flush
    >
      <QueryView query={needs}>
        {(data) => {
          const shortProducts = new Map<string, number>();
          for (const order of atRisk)
            for (const line of order.lines)
              if (line.status === 'SHORT')
                shortProducts.set(line.product.id, (shortProducts.get(line.product.id) ?? 0) + 1);
          const blocks = (need: PurchaseNeed) =>
            need.usedBy.reduce((sum, product) => sum + (shortProducts.get(product.id) ?? 0), 0);
          const rows = data.rows
            .filter((need) => !isZero(need.toBuy.quantity))
            .map((need) => ({ need, blocks: blocks(need) }))
            .sort((a, b) => b.blocks - a.blocks)
            .slice(0, 6);
          const rest =
            data.rows.filter((need) => !isZero(need.toBuy.quantity)).length - rows.length;
          return rows.length === 0 ? (
            <EmptyState
              icon={<CircleCheck />}
              title="No falta nada por comprar"
              description="Lo que hay y lo que viene en camino cubre todo lo vendido."
            />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {rows.map(({ need, blocks: count }) => (
                  <li key={need.product.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <EntityLink to="product" id={need.product.id} className="font-medium">
                        {need.product.name}
                      </EntityLink>
                      <p className="text-[12.5px] text-ink-3">
                        {count > 0
                          ? `Frena ${plural(count, 'preventa', 'preventas')}`
                          : `Para ${plural(need.usedBy.length, 'producto', 'productos')}`}
                        {need.inTransit.length > 0 ? (
                          <>
                            {' · en camino '}
                            <Qty value={need.onOrder} className="text-ink-3" />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <Qty value={need.toBuy} emphasis />
                      <p className="text-[12px] text-ink-3">por comprar</p>
                    </div>
                  </li>
                ))}
              </ul>
              {rest > 0 ? (
                <Link
                  to="/compras"
                  className="block border-t border-line px-5 py-3 text-sm font-medium text-brand hover:bg-surface-2/60"
                >
                  Y {plural(rest, 'insumo más', 'insumos más')}
                </Link>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Panel>
  );
}

/** Purchases and production orders past their date: the supply chain's own delays. */
function DelaysPanel() {
  const purchases = usePurchaseOrders('OPEN');
  const production = useProductionOrders('PLANNED');
  const latePurchases = (purchases.data ?? []).filter((order) => isLate(order.expectedDate));
  const lateProduction = (production.data ?? []).filter((order) => isLate(order.scheduledDate));
  if (latePurchases.length === 0 && lateProduction.length === 0) return null;
  return (
    <Panel title="Atrasos en la cadena" description="Compras y producción que ya pasaron su fecha.">
      <ul className="flex flex-col gap-3 text-sm">
        {latePurchases.map((order) => (
          <li key={order.id} className="flex items-start gap-3">
            <ShoppingCart aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <EntityLink to="purchase-order" id={order.id} className="font-medium">
                {order.label}
              </EntityLink>{' '}
              <span className="text-ink-2">· {order.supplier}</span>
              <p className="text-[12.5px] text-ink-3">
                {order.lines.map((line) => line.productName).join(', ')}
              </p>
            </div>
            <DueDate date={order.expectedDate} lateLabel="No ha llegado" />
          </li>
        ))}
        {lateProduction.map((order) => (
          <li key={order.id} className="flex items-start gap-3">
            <Factory aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <EntityLink to="production-order" id={order.id} className="font-medium">
                {order.label}
              </EntityLink>{' '}
              <span className="text-ink-2">· {order.product.name}</span>
              <p className="text-[12.5px] text-ink-3">{order.kind}</p>
            </div>
            <DueDate date={order.scheduledDate} lateLabel="Sin producir" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --- oversell -----------------------------------------------------------------------------------

function OversellPanel() {
  const oversell = useOversell();
  return (
    <Panel
      title="Reporte de sobreventa"
      description="Lo vendido en preventa frente a lo que se puede fabricar con las existencias de hoy."
      flush
    >
      <QueryView query={oversell}>
        {(data) => {
          const short = data.rows.filter((row) => !isZero(row.uncovered.quantity));
          const covered = data.rows.filter((row) => isZero(row.uncovered.quantity));
          if (data.rows.length === 0)
            return (
              <EmptyState
                icon={<CircleCheck />}
                title="No hay preventas confirmadas pendientes"
                description="Cuando ventas confirme una preventa, aquí verás si se puede cumplir."
              />
            );
          return (
            <>
              <ul className="divide-y divide-line">
                {short.map((row, index) => (
                  <OversellItem key={row.product.id} row={row} open={index === 0} />
                ))}
              </ul>
              {covered.length > 0 ? (
                <details className="group border-t border-line">
                  <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium text-ink-2 hover:bg-surface-2/60">
                    <span className="inline-flex items-center gap-2">
                      <CircleCheck aria-hidden className="size-4 text-good" />
                      {plural(covered.length, 'producto vendido', 'productos vendidos')} con
                      cobertura completa
                    </span>
                  </summary>
                  <ul className="divide-y divide-line border-t border-line">
                    {covered.map((row) => (
                      <OversellItem key={row.product.id} row={row} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Panel>
  );
}

function OversellItem({ row, open = false }: { row: OversellRow; open?: boolean }) {
  const uncovered = !isZero(row.uncovered.quantity);
  return (
    <li className="px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink-2">
              {row.product.code}
            </span>
            <EntityLink to="product" id={row.product.id} className="font-semibold">
              {row.product.name}
            </EntityLink>
          </div>
          <div className="mt-3 max-w-2xl">
            <CoverageGauge
              sold={row.sold}
              onHand={row.onHand}
              producible={row.producible}
              uncovered={row.uncovered}
            />
          </div>
          {row.limitingMaterial && uncovered ? (
            <p className="mt-2 text-[13px] text-ink-3">
              Limita la producción:{' '}
              <EntityLink to="product" id={row.limitingMaterial.id}>
                {row.limitingMaterial.name}
              </EntityLink>
            </p>
          ) : null}
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 text-right lg:w-[300px]">
          <dt className="text-[12.5px] text-ink-3">Vendido</dt>
          <dt className="text-[12.5px] text-ink-3">Capacidad</dt>
          <dt className="text-[12.5px] text-ink-3">Sin cobertura</dt>
          <dd>
            <Qty value={row.sold} emphasis />
          </dd>
          <dd>
            <Qty value={row.capacity} emphasis />
          </dd>
          <dd>
            <Qty
              value={row.uncovered}
              emphasis
              className={uncovered ? 'text-critical' : ''}
              dimZero
            />
          </dd>
        </dl>
      </div>
      <details className="group mt-3" open={open}>
        <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-[13px] font-medium text-brand hover:underline">
          <ChevronRight
            aria-hidden
            className="size-3.5 transition-transform group-open:rotate-90"
          />
          {plural(row.bySeller.length, 'vendedor', 'vendedores')}
          {uncovered
            ? ` · ${plural(row.materialsToCover.length, 'insumo', 'insumos')} para cubrir el faltante`
            : ''}
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Vendido por vendedor</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {row.bySeller.map((seller) => (
                <li key={seller.sellerId} className="flex items-baseline justify-between gap-3">
                  <span>
                    {seller.sellerName}
                    <span className="ml-1.5 text-[12.5px] text-ink-3">
                      {plural(seller.orders, 'preventa', 'preventas')}
                    </span>
                  </span>
                  <Qty value={seller.quantity} />
                </li>
              ))}
              {!isZero(row.potential.quantity) ? (
                <li className="flex items-baseline justify-between gap-3 text-ink-3">
                  <span>En borrador (no cuenta todavía)</span>
                  <Qty value={row.potential} className="text-ink-3" />
                </li>
              ) : null}
            </ul>
          </div>
          {uncovered ? (
            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">
                Para cubrir el faltante hay que comprar
              </p>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {row.materialsToCover.map((material) => (
                  <li key={material.id} className="flex items-baseline justify-between gap-3">
                    <EntityLink to="product" id={material.id} className="truncate">
                      {material.name}
                    </EntityLink>
                    <Qty value={material.quantity} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

// --- sellers ------------------------------------------------------------------------------------

function SellersPanel({ orders }: { orders: OrderCoverage[] }) {
  const [view, setView] = useState<'risk' | 'all'>('risk');
  const sellers = useMemo(() => {
    const bySeller = new Map<
      string,
      { name: string; total: number; late: number } & Record<CoverageStatus, number>
    >();
    for (const order of orders) {
      const entry = bySeller.get(order.seller.id) ?? {
        name: order.seller.name,
        total: 0,
        late: 0,
        COVERED: 0,
        NEEDS_PRODUCTION: 0,
        SHORT: 0,
      };
      entry.total++;
      entry[order.status]++;
      if (isLate(order.estimatedDeliveryDate)) entry.late++;
      bySeller.set(order.seller.id, entry);
    }
    return [...bySeller.values()].sort((a, b) => b.SHORT + b.late - (a.SHORT + a.late));
  }, [orders]);
  const rows = view === 'risk' ? sellers.filter((s) => s.SHORT + s.late > 0) : sellers;

  return (
    <Panel
      title="Por vendedor"
      description="Preventas confirmadas de cada vendedor y cuántas están en riesgo."
      actions={
        <Segmented
          label="Vendedores"
          value={view}
          onChange={setView}
          options={[
            { value: 'risk', label: 'Con riesgo' },
            { value: 'all', label: 'Todos' },
          ]}
        />
      }
      flush
    >
      {rows.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title="Ningún vendedor tiene preventas en riesgo" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((seller) => (
            <li
              key={seller.name}
              className="grid gap-3 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center"
            >
              <p className="font-medium">{seller.name}</p>
              <div
                className="flex h-2.5 gap-[2px] overflow-hidden rounded-[4px] bg-surface-2"
                role="img"
                aria-label={`${String(seller.COVERED)} cubiertas, ${String(seller.NEEDS_PRODUCTION)} requieren producción, ${String(seller.SHORT)} con faltante`}
              >
                {(
                  [
                    ['bg-good', seller.COVERED],
                    ['bg-warning', seller.NEEDS_PRODUCTION],
                    ['bg-critical', seller.SHORT],
                  ] as const
                )
                  .filter(([, count]) => count > 0)
                  .map(([fill, count]) => (
                    <div key={fill} className={fill} style={{ flexGrow: count }} />
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[13px] sm:justify-end">
                <span className="text-ink-2">{plural(seller.total, 'preventa', 'preventas')}</span>
                {seller.late > 0 ? (
                  <Chip tone="critical" icon={Clock}>
                    {plural(seller.late, 'atrasada', 'atrasadas')}
                  </Chip>
                ) : null}
                {seller.SHORT > 0 ? (
                  <Chip tone="critical" icon={TriangleAlert}>
                    {`${String(seller.SHORT)} sin insumos`}
                  </Chip>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
