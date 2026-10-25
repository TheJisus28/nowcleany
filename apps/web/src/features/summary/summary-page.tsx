import {
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Factory,
  ShoppingCart,
  TriangleAlert,
  Truck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useOrderCoverage, useOversell, useSummary } from '../../api/hooks';
import type { OrderCoverage, OversellRow } from '../../api/types';
import { useSession } from '../../auth/session';
import { CoverageGauge } from '../../components/coverage-gauge';
import { DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { Qty } from '../../components/qty';
import { CoverageChip } from '../../components/status';
import { EmptyState, PageHeader, Panel, QueryView } from '../../components/ui';
import {
  formatDate,
  formatDecimal,
  isZero,
  plural,
  relativeDays,
  unitLabel,
} from '../../lib/format';

export function SummaryPage() {
  const summary = useSummary();
  const oversell = useOversell();
  const coverage = useOrderCoverage();

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Cómo está cubierto lo que se vendió y qué falta producir o comprar para cumplirlo."
      />

      <QueryView query={oversell}>{(data) => <Hero rows={data.rows} />}</QueryView>

      <QueryView query={summary}>
        {(data) => (
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Preventas confirmadas"
              value={data.confirmedOrders}
              icon={ClipboardList}
              tone="brand"
              hint={`${plural(data.ordersByCoverage.SHORT, 'preventa', 'preventas')} con faltante de insumos`}
              to="/ventas"
            />
            <Kpi
              label="Productos por envasar"
              value={data.productsToPack}
              icon={Factory}
              tone={data.productsToPack > 0 ? 'warning' : 'good'}
              hint={`${plural(data.bulksToProduce, 'granel', 'graneles')} por producir · ${plural(data.plannedProductionOrders, 'orden programada', 'órdenes programadas')}`}
              to="/planta"
            />
            <Kpi
              label="Insumos por comprar"
              value={data.materialsToBuy}
              icon={ShoppingCart}
              tone={data.materialsToBuy > 0 ? 'critical' : 'good'}
              hint="Exactamente el faltante, sin stock de seguridad"
              to="/compras"
            />
            <Kpi
              label="Compras en tránsito"
              value={data.purchaseOrdersInTransit}
              icon={Truck}
              tone="neutral"
              hint="Ya descontadas de lo que hay que comprar"
              to="/compras"
            />
          </div>
        )}
      </QueryView>

      <div className="flex flex-col gap-6">
        <Panel
          title="Reporte de sobreventa"
          description="Lo vendido en preventa frente a lo que se puede fabricar con las existencias de hoy."
        >
          <QueryView query={oversell}>
            {(data) =>
              data.rows.length === 0 ? (
                <EmptyState
                  icon={<CircleCheck />}
                  title="No hay preventas confirmadas pendientes"
                  description="Cuando ventas confirme una preventa, aquí verás si se puede cumplir."
                />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {data.rows.map((row) => (
                    <OversellItem key={row.product.id} row={row} />
                  ))}
                </ul>
              )
            }
          </QueryView>
        </Panel>

        <Panel
          title="Cobertura de las preventas"
          description="En orden de prioridad: primero la fecha de entrega más cercana."
          flush
        >
          <QueryView query={coverage}>{(rows) => <CoverageTable rows={rows} />}</QueryView>
        </Panel>
      </div>
    </>
  );
}

/** The one number this view leads with: what cannot be made with what is on hand. */
function Hero({ rows }: { rows: OversellRow[] }) {
  const { can } = useSession();
  const short = rows.filter((row) => !isZero(row.uncovered.quantity));
  const [worst] = [...short].sort(
    (a, b) => Number(b.uncovered.quantity) - Number(a.uncovered.quantity),
  );

  if (!worst) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-[10px] border border-line bg-surface px-5 py-4">
        <CircleCheck aria-hidden className="size-5 text-good" />
        <p className="text-[15px]">
          Todo lo vendido se puede cumplir con el stock y los insumos disponibles.
        </p>
      </div>
    );
  }

  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-critical/25 bg-surface">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <TriangleAlert aria-hidden className="size-4 text-critical" />
            Sobreventa sin cobertura
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-[56px] leading-none font-semibold tracking-[-0.03em] [font-stretch:105%]">
              {formatDecimal(worst.uncovered.quantity)}
            </span>
            <span className="text-xl text-ink-2">{unitLabel(worst.uncovered.unit)}</span>
          </p>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">
            de <span className="font-medium text-ink">{worst.product.name}</span> no se pueden
            fabricar con lo que hay en bodega
            {short.length > 1
              ? ` (y ${String(short.length - 1)} producto(s) más con faltante)`
              : ''}
            .
          </p>
        </div>
        {can('purchasing:read') ? (
          <Link
            to="/compras"
            className="inline-flex h-10 items-center gap-2 self-start rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong sm:self-auto"
          >
            Ver qué comprar
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function OversellItem({ row }: { row: OversellRow }) {
  const uncovered = !isZero(row.uncovered.quantity);
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink-2">
              {row.product.code}
            </span>
            <h3 className="font-semibold">{row.product.name}</h3>
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
              Limita la producción: {row.limitingMaterial.name} ({row.limitingMaterial.code})
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

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Vendido por vendedor</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {row.bySeller.map((seller) => (
              <li key={seller.sellerId} className="flex items-baseline justify-between gap-3">
                <span>
                  {seller.sellerName}
                  <span className="ml-1.5 text-[12.5px] text-ink-3">
                    {seller.orders} preventa{seller.orders === 1 ? '' : 's'}
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
                  <span className="truncate" title={material.name}>
                    {material.name}
                  </span>
                  <Qty value={material.quantity} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function CoverageTable({ rows }: { rows: OrderCoverage[] }) {
  const navigate = useNavigate();
  return (
    <DataTable
      label="Cobertura de las preventas"
      rows={rows}
      rowKey={(row) => row.orderId}
      onRowClick={(row) => {
        void navigate(`/ventas/${row.orderId}`);
      }}
      empty={<EmptyState title="Sin preventas confirmadas" />}
      columns={[
        {
          key: 'order',
          header: 'Preventa',
          render: (row) => (
            <span className="flex items-center gap-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2 tabular-nums">
                {row.priority}
              </span>
              <span className="font-medium">{row.label}</span>
            </span>
          ),
        },
        { key: 'customer', header: 'Cliente', render: (row) => row.customerName },
        { key: 'seller', header: 'Vendedor', render: (row) => row.seller.name, hideOnMobile: true },
        {
          key: 'delivery',
          header: 'Entrega',
          render: (row) => (
            <span title={formatDate(row.estimatedDeliveryDate)}>
              {relativeDays(row.estimatedDeliveryDate)}
            </span>
          ),
        },
        {
          key: 'products',
          header: 'Productos',
          hideOnMobile: true,
          render: (row) => (
            <span className="text-ink-2">
              {row.lines
                .map((line) => `${line.product.code} × ${formatDecimal(line.quantity.quantity)}`)
                .join(', ')}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Cobertura',
          render: (row) => <CoverageChip status={row.status} />,
        },
      ]}
    />
  );
}
