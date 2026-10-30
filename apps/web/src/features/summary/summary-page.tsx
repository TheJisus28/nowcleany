import { CircleCheck, Factory, FilterX, ShoppingCart, TriangleAlert } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  useOrderCoverage,
  useOversell,
  useProductionNeeds,
  useProductionOrders,
  usePurchaseNeeds,
  usePurchaseOrders,
  useStockAllocation,
} from '../../api/hooks';
import type {
  CoverageStatus,
  OrderCoverage,
  ProductType,
  PurchaseNeed,
  StockAllocationRow,
} from '../../api/types';
import {
  type Datum,
  Legend,
  type Series,
  StackedBars,
  StackedColumns,
} from '../../components/charts';
import { CoverageGauge } from '../../components/coverage-gauge';
import { EntityLink, pathTo } from '../../components/links';
import { Qty } from '../../components/qty';
import { COVERAGE, CoverageChip, DueDate } from '../../components/status';
import {
  cn,
  EmptyState,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Select,
} from '../../components/ui';
import {
  daysUntil,
  formatDecimal,
  isZero,
  plural,
  roundUpDecimal,
  todayIso,
  unitLabel,
} from '../../lib/format';

const today = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());

// --- filters --------------------------------------------------------------------------------------

interface Filters {
  seller: string | null;
  product: string | null;
  delivery: string | null;
  coverage: CoverageStatus | null;
}
type FilterKey = keyof Filters;

const PARAMS: Record<FilterKey, string> = {
  seller: 'vendedor',
  product: 'producto',
  delivery: 'entrega',
  coverage: 'cobertura',
};

/** Filters live in the URL: the view can be shared and survives a reload. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: Filters = {
    seller: params.get(PARAMS.seller),
    product: params.get(PARAMS.product),
    delivery: params.get(PARAMS.delivery),
    coverage: params.get(PARAMS.coverage) as CoverageStatus | null,
  };
  const set = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch) as [FilterKey, string | null][]) {
      if (value) next.set(PARAMS[key], value);
      else next.delete(PARAMS[key]);
    }
    setParams(next, { replace: true });
  };
  const clear = () => {
    setParams({}, { replace: true });
  };
  return { filters, set, clear };
}

const monthName = new Intl.DateTimeFormat('es-CO', { month: 'short' });
/** Compact date range from today: "25–31 oct" or "29 oct–4 nov". */
const range = (from: number, to: number) => {
  const [a, b] = [from, to].map((offset) => new Date(`${todayIso(offset)}T12:00:00`));
  if (!a || !b) return '';
  const month = (date: Date) => monthName.format(date).replace('.', '');
  return month(a) === month(b)
    ? `${String(a.getDate())}–${String(b.getDate())} ${month(b)}`
    : `${String(a.getDate())} ${month(a)}–${String(b.getDate())} ${month(b)}`;
};

/** Delivery buckets for the weekly chart, plus two presets for the filter. */
const BUCKETS: { key: string; label: string; sub?: string; test: (days: number) => boolean }[] = [
  { key: 'atrasadas', label: 'Atrasadas', test: (d) => d < 0 },
  { key: 'semana-0', label: 'Esta semana', sub: range(0, 6), test: (d) => d >= 0 && d < 7 },
  { key: 'semana-1', label: 'Próxima', sub: range(7, 13), test: (d) => d >= 7 && d < 14 },
  { key: 'semana-2', label: 'En 2 sem.', sub: range(14, 20), test: (d) => d >= 14 && d < 21 },
  { key: 'semana-3', label: 'En 3 sem.', sub: range(21, 27), test: (d) => d >= 21 && d < 28 },
  { key: 'despues', label: 'Después', sub: '+4 semanas', test: (d) => d >= 28 },
];
const PRESETS = [
  { key: '7', label: 'Próximos 7 días', test: (d: number) => d >= 0 && d <= 7 },
  { key: '30', label: 'Próximos 30 días', test: (d: number) => d >= 0 && d <= 30 },
];

const daysOf = (date: string | null) => daysUntil(date) ?? 999;
const isLate = (date: string | null) => daysOf(date) < 0;
const deliveryMatches = (key: string, date: string | null) =>
  [...BUCKETS, ...PRESETS].find((bucket) => bucket.key === key)?.test(daysOf(date)) ?? true;

function matches(order: OrderCoverage, filters: Filters, except?: FilterKey): boolean {
  return (
    (except === 'seller' || !filters.seller || order.seller.id === filters.seller) &&
    (except === 'product' ||
      !filters.product ||
      order.lines.some((line) => line.product.id === filters.product)) &&
    (except === 'delivery' ||
      !filters.delivery ||
      deliveryMatches(filters.delivery, order.estimatedDeliveryDate)) &&
    (except === 'coverage' || !filters.coverage || order.status === filters.coverage)
  );
}

const STATUS_SERIES: Series[] = [
  { key: 'COVERED', label: COVERAGE.COVERED.label, fill: 'bg-good', icon: COVERAGE.COVERED.icon },
  {
    key: 'NEEDS_PRODUCTION',
    label: COVERAGE.NEEDS_PRODUCTION.label,
    fill: 'bg-warning',
    icon: COVERAGE.NEEDS_PRODUCTION.icon,
  },
  { key: 'SHORT', label: COVERAGE.SHORT.label, fill: 'bg-critical', icon: COVERAGE.SHORT.icon },
];

const LINE_SERIES: Series[] = [
  { key: 'fromStock', label: 'Desde stock', fill: 'bg-good', icon: COVERAGE.COVERED.icon },
  {
    key: 'fromProduction',
    label: 'Por producir',
    fill: 'bg-warning',
    icon: COVERAGE.NEEDS_PRODUCTION.icon,
  },
  { key: 'uncovered', label: 'Sin cobertura', fill: 'bg-critical', icon: COVERAGE.SHORT.icon },
];

const STOCK_SERIES: Series[] = [
  { key: 'forProduction', label: 'Apartado para producción', fill: 'bg-series-1' },
  { key: 'forOrders', label: 'Para preventas sin programar', fill: 'bg-series-3' },
  { key: 'idle', label: 'Quieto', fill: 'bg-series-2' },
  { key: 'missing', label: 'Falta', fill: 'bg-critical', icon: TriangleAlert },
];

/** A series value of a chart datum (0 when absent). */
const value = (datum: Datum, key: string): number => datum.values[key] ?? 0;

const ordersLabel = (count: number) => plural(count, 'preventa', 'preventas');
const units = (value: number) => `${formatDecimal(String(value))} und`;
const num = (value: string) => Number(value);

// --- page -----------------------------------------------------------------------------------------

export function SummaryPage() {
  const coverage = useOrderCoverage();
  return (
    <>
      <PageHeader
        title="Sobreventa y cobertura"
        description={`Hoy, ${today}. Filtra por vendedor, producto, entrega o cobertura; también haciendo clic en los gráficos.`}
      />
      <QueryView query={coverage}>{(rows) => <Dashboard orders={rows} />}</QueryView>
    </>
  );
}

function Dashboard({ orders }: { orders: OrderCoverage[] }) {
  const { filters, set, clear } = useFilters();
  const filtered = useMemo(() => orders.filter((o) => matches(o, filters)), [orders, filters]);
  const atRisk = useMemo(
    () =>
      filtered
        .filter((order) => order.status === 'SHORT' || isLate(order.estimatedDeliveryDate))
        .sort(
          (a, b) =>
            Number(isLate(b.estimatedDeliveryDate)) - Number(isLate(a.estimatedDeliveryDate)) ||
            a.priority - b.priority,
        ),
    [filtered],
  );

  return (
    <div className="flex flex-col gap-6">
      <FilterBar orders={orders} filtered={filtered} filters={filters} set={set} clear={clear} />
      <KpiStrip filtered={filtered} atRisk={atRisk} filters={filters} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Entregas por semana"
          description="Preventas confirmadas según su fecha de entrega y si se pueden cumplir."
        >
          <WeeksChart orders={orders} filters={filters} set={set} />
        </Panel>
        <Panel
          title="Cobertura por vendedor"
          description="Cuántas preventas de cada vendedor están cubiertas, esperan producción o les faltan insumos."
        >
          <SellersChart orders={orders} filters={filters} set={set} />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Vendido frente a lo que se puede cumplir"
          description="Por producto: qué parte sale del stock, cuál hay que fabricar y cuál no tiene cobertura."
        >
          <ProductsChart orders={orders} filters={filters} set={set} />
        </Panel>
        <Panel
          title="Estado del inventario"
          description="Para qué está cada existencia. No depende de los filtros de ventas."
        >
          <InventoryChart />
        </Panel>
      </div>

      {filters.product ? <ProductDetail productId={filters.product} /> : null}

      <AttentionTable atRisk={atRisk} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <BuyFirst atRisk={atRisk} />
        <Delays />
      </div>
    </div>
  );
}

// --- filter bar & KPIs ----------------------------------------------------------------------------

function FilterBar({
  orders,
  filtered,
  filters,
  set,
  clear,
}: {
  orders: OrderCoverage[];
  filtered: OrderCoverage[];
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  clear: () => void;
}) {
  const sellers = [...new Map(orders.map((o) => [o.seller.id, o.seller.name]))].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const products = [
    ...new Map(orders.flatMap((o) => o.lines.map((l) => [l.product.id, l.product]))).values(),
  ].sort((a, b) => a.code.localeCompare(b.code));
  const active = Object.values(filters).filter(Boolean).length;

  const select = (
    key: FilterKey,
    label: string,
    options: { value: string; label: string }[],
    all: string,
  ) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-medium text-ink-3">{label}</span>
      <Select
        value={filters[key] ?? ''}
        onChange={(event) => {
          set({ [key]: event.target.value || null });
        }}
        className={cn('h-9 text-[13.5px]', filters[key] && 'border-brand bg-brand-soft/40')}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <section
      aria-label="Filtros"
      className="z-20 rounded-[10px] border border-line bg-surface/95 px-4 py-3 backdrop-blur lg:sticky lg:top-2"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end">
        {select(
          'seller',
          'Vendedor',
          sellers.map(([id, name]) => ({ value: id, label: name })),
          'Todos',
        )}
        {select(
          'product',
          'Producto',
          products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
          'Todos',
        )}
        {select(
          'delivery',
          'Entrega',
          [...BUCKETS, ...PRESETS].map((b) => ({ value: b.key, label: b.label })),
          'Cualquier fecha',
        )}
        {select(
          'coverage',
          'Cobertura',
          STATUS_SERIES.map((s) => ({ value: s.key, label: s.label })),
          'Toda',
        )}
        <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:flex-col md:items-end md:justify-end md:gap-1">
          <p className="text-[12.5px] whitespace-nowrap text-ink-3">
            {filtered.length === orders.length
              ? `${ordersLabel(orders.length)} confirmadas`
              : `${String(filtered.length)} de ${ordersLabel(orders.length)}`}
          </p>
          <button
            type="button"
            disabled={active === 0}
            onClick={clear}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-brand hover:bg-brand-soft/60 disabled:pointer-events-none disabled:text-ink-3/60"
          >
            <FilterX aria-hidden className="size-4" />
            Limpiar{active > 0 ? ` (${String(active)})` : ''}
          </button>
        </div>
      </div>
    </section>
  );
}

function KpiStrip({
  filtered,
  atRisk,
  filters,
}: {
  filtered: OrderCoverage[];
  atRisk: OrderCoverage[];
  filters: Filters;
}) {
  const lines = filtered.flatMap((order) =>
    order.lines.filter((line) => !filters.product || line.product.id === filters.product),
  );
  const sold = lines.reduce((sum, line) => sum + num(line.quantity.quantity), 0);
  const uncovered = lines.reduce((sum, line) => sum + num(line.uncovered.quantity), 0);
  const late = filtered.filter((order) => isLate(order.estimatedDeliveryDate)).length;
  const short = filtered.filter((order) => order.status === 'SHORT').length;
  const covered = filtered.filter((order) => order.status === 'COVERED').length;

  const cells: { label: string; value: ReactNode; hint: string; tone?: 'critical' | 'good' }[] = [
    {
      label: 'Preventas confirmadas',
      value: filtered.length,
      hint: `${String(covered)} se pueden despachar ya`,
    },
    {
      label: 'En riesgo',
      value: atRisk.length,
      hint: `${String(late)} atrasadas · ${String(short)} sin insumos`,
      ...(atRisk.length > 0 ? { tone: 'critical' as const } : { tone: 'good' as const }),
    },
    {
      label: 'Unidades vendidas',
      value: formatDecimal(String(sold)),
      hint: 'Pendientes de despachar',
    },
    {
      label: 'Sin cobertura',
      value: formatDecimal(String(uncovered)),
      hint: uncovered > 0 ? 'Unidades que hoy no se pueden fabricar' : 'Todo se puede cumplir',
      ...(uncovered > 0 ? { tone: 'critical' as const } : { tone: 'good' as const }),
    },
  ];

  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-surface lg:grid-cols-4">
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={cn(
            'px-5 py-4',
            index % 2 === 1 && 'border-l border-line',
            index >= 2 && 'border-t border-line lg:border-t-0',
            index === 2 && 'lg:border-l',
          )}
        >
          <p className="text-[13px] text-ink-2">{cell.label}</p>
          <p
            className={cn(
              'mt-1 text-[30px] leading-none font-semibold tracking-tight tabular-nums',
              cell.tone === 'critical' && 'text-critical',
            )}
          >
            {cell.value}
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-3">{cell.hint}</p>
        </div>
      ))}
    </section>
  );
}

// --- charts ---------------------------------------------------------------------------------------

interface ChartProps {
  orders: OrderCoverage[];
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
}

const countByStatus = (rows: OrderCoverage[]): Record<string, number> => ({
  COVERED: rows.filter((o) => o.status === 'COVERED').length,
  NEEDS_PRODUCTION: rows.filter((o) => o.status === 'NEEDS_PRODUCTION').length,
  SHORT: rows.filter((o) => o.status === 'SHORT').length,
});

/** A chart filters everything else but not itself (it keeps showing all its categories). */
function WeeksChart({ orders, filters, set }: ChartProps) {
  const base = orders.filter((o) => matches(o, filters, 'delivery'));
  const data: Datum[] = BUCKETS.map((bucket) => {
    const rows = base.filter((o) => bucket.test(daysOf(o.estimatedDeliveryDate)));
    return {
      key: bucket.key,
      label: bucket.label,
      ...(bucket.sub ? { sub: bucket.sub } : {}),
      values: countByStatus(rows),
    };
  });
  return (
    <>
      <StackedColumns
        data={data}
        series={STATUS_SERIES}
        label="Entregas por semana"
        selected={filters.delivery}
        onSelect={(key) => {
          set({ delivery: key });
        }}
        unit={(value) => ordersLabel(value)}
      />
      <Legend series={STATUS_SERIES} className="mt-4" />
    </>
  );
}

function SellersChart({ orders, filters, set }: ChartProps) {
  const base = orders.filter((o) => matches(o, filters, 'seller'));
  const sellers = [...new Map(base.map((o) => [o.seller.id, o.seller.name]))];
  const data: Datum[] = sellers
    .map(([id, name]) => {
      const rows = base.filter((o) => o.seller.id === id);
      const late = rows.filter((o) => isLate(o.estimatedDeliveryDate)).length;
      return {
        key: id,
        label: name,
        sub: late > 0 ? plural(late, 'atrasada', 'atrasadas') : ordersLabel(rows.length),
        values: countByStatus(rows),
      };
    })
    .sort((a, b) => value(b, 'SHORT') - value(a, 'SHORT'));
  if (data.length === 0) return <EmptyState title="Sin preventas con estos filtros" />;
  return (
    <>
      <StackedBars
        data={data}
        series={STATUS_SERIES}
        label="Cobertura por vendedor"
        selected={filters.seller}
        onSelect={(key) => {
          set({ seller: key });
        }}
        unit={(value) => ordersLabel(value)}
        aside={(datum) => {
          const short = value(datum, 'SHORT');
          const all = Object.values(datum.values).reduce((sum, value) => sum + value, 0);
          return short > 0 ? (
            <span>
              <span className="font-semibold text-critical">{short}</span> de {all} sin insumos
            </span>
          ) : (
            `${String(all)} sin riesgo de insumos`
          );
        }}
      />
      <Legend series={STATUS_SERIES} className="mt-4" />
    </>
  );
}

function ProductsChart({ orders, filters, set }: ChartProps) {
  const [all, setAll] = useState(false);
  const totals = new Map<
    string,
    { label: string; code: string; fromStock: number; fromProduction: number; uncovered: number }
  >();
  for (const order of orders.filter((o) => matches(o, filters, 'product')))
    for (const line of order.lines) {
      const entry = totals.get(line.product.id) ?? {
        label: line.product.name,
        code: line.product.code,
        fromStock: 0,
        fromProduction: 0,
        uncovered: 0,
      };
      entry.fromStock += num(line.fromStock.quantity);
      entry.fromProduction += num(line.fromProduction.quantity);
      entry.uncovered += num(line.uncovered.quantity);
      totals.set(line.product.id, entry);
    }
  const data: Datum[] = [...totals]
    .map(([id, entry]) => ({
      key: id,
      label: entry.label,
      sub: entry.code,
      values: {
        fromStock: entry.fromStock,
        fromProduction: entry.fromProduction,
        uncovered: entry.uncovered,
      },
    }))
    .sort(
      (a, b) =>
        value(b, 'uncovered') - value(a, 'uncovered') ||
        value(b, 'fromProduction') - value(a, 'fromProduction'),
    );
  if (data.length === 0) return <EmptyState title="Sin preventas con estos filtros" />;
  const shown = all ? data : data.slice(0, 8);
  return (
    <>
      <StackedBars
        data={shown}
        series={LINE_SERIES}
        label="Vendido frente a lo que se puede cumplir"
        normalize
        selected={filters.product}
        onSelect={(key) => {
          set({ product: key });
        }}
        unit={(value) => units(value)}
        aside={(datum) => {
          const sold = Object.values(datum.values).reduce((sum, value) => sum + value, 0);
          const missing = value(datum, 'uncovered');
          return missing > 0 ? (
            <span>
              <span className="font-semibold text-critical">{formatDecimal(String(missing))}</span>{' '}
              de {formatDecimal(String(sold))} sin cubrir
            </span>
          ) : (
            `${formatDecimal(String(sold))} und cubiertas`
          );
        }}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Legend series={LINE_SERIES} />
        {data.length > 8 ? (
          <button
            type="button"
            onClick={() => {
              setAll((value) => !value);
            }}
            className="text-[13px] font-medium text-brand hover:underline"
          >
            {all ? 'Ver menos' : `Ver los ${String(data.length)}`}
          </button>
        ) : null}
      </div>
    </>
  );
}

const STOCK_TYPES: { value: ProductType; label: string }[] = [
  { value: 'RAW_MATERIAL', label: 'Insumos' },
  { value: 'BULK', label: 'Granel' },
  { value: 'FINISHED_GOOD', label: 'Terminados' },
];

function InventoryChart() {
  const allocation = useStockAllocation();
  const navigate = useNavigate();
  const [type, setType] = useState<ProductType>('RAW_MATERIAL');
  const [mode, setMode] = useState<'missing' | 'idle'>('missing');
  const [all, setAll] = useState(false);
  return (
    <QueryView query={allocation}>
      {(data) => {
        const rows = data.rows.filter((row) => row.type === type);
        const amount = (row: StockAllocationRow, key: keyof StockAllocationRow) =>
          num((row[key] as { quantity: string }).quantity);
        const ranked = rows
          .filter((row) => amount(row, mode) > 0)
          .sort(
            (a, b) =>
              amount(b, mode) / Math.max(amount(b, 'onHand') + amount(b, 'missing'), 1) -
              amount(a, mode) / Math.max(amount(a, 'onHand') + amount(a, 'missing'), 1),
          );
        const shown = all ? ranked : ranked.slice(0, 8);
        const counts = {
          missing: rows.filter((row) => amount(row, 'missing') > 0).length,
          idle: rows.filter((row) => amount(row, 'idle') > 0).length,
          forProduction: rows.filter((row) => amount(row, 'forProduction') > 0).length,
        };
        const byKey = new Map(rows.map((row) => [row.product.id, row]));
        const datums: Datum[] = shown.map((row) => ({
          key: row.product.id,
          label: row.product.name,
          sub: row.product.code,
          values: {
            forProduction: amount(row, 'forProduction'),
            forOrders: amount(row, 'forOrders'),
            idle: amount(row, 'idle'),
            missing: amount(row, 'missing'),
          },
        }));
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented label="Tipo" value={type} onChange={setType} options={STOCK_TYPES} />
              <Segmented
                label="Ordenar por"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'missing', label: `Con faltante · ${String(counts.missing)}` },
                  { value: 'idle', label: `Con stock quieto · ${String(counts.idle)}` },
                ]}
              />
            </div>
            {datums.length === 0 ? (
              <EmptyState
                icon={<CircleCheck />}
                title={mode === 'missing' ? 'No falta nada de este tipo' : 'No hay stock quieto'}
                description={
                  mode === 'missing'
                    ? 'Las existencias cubren lo vendido.'
                    : 'Todo lo que hay en bodega tiene destino.'
                }
              />
            ) : (
              <StackedBars
                data={datums}
                series={STOCK_SERIES}
                label="Estado del inventario"
                normalize
                onSelect={(key) => {
                  if (key) void navigate(pathTo('product', key));
                }}
                unit={(amount, datum) => {
                  const row = byKey.get(datum.key);
                  return `${formatDecimal(roundUpDecimal(String(amount)))} ${unitLabel(row?.onHand.unit ?? '')}`;
                }}
                aside={(datum) => {
                  const row = byKey.get(datum.key);
                  if (!row) return null;
                  const q = mode === 'missing' ? row.missing : row.idle;
                  return (
                    <span>
                      {mode === 'missing' ? 'falta ' : 'quieto '}
                      <Qty
                        value={q}
                        emphasis
                        className={mode === 'missing' ? 'text-critical' : ''}
                      />
                    </span>
                  );
                }}
              />
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Legend series={STOCK_SERIES} />
              {ranked.length > 8 ? (
                <button
                  type="button"
                  onClick={() => {
                    setAll((current) => !current);
                  }}
                  className="text-[13px] font-medium text-brand hover:underline"
                >
                  {all ? 'Ver menos' : `Ver los ${String(ranked.length)}`}
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">
              {plural(counts.forProduction, 'producto tiene', 'productos tienen')} stock apartado
              para órdenes de producción programadas. Clic en una barra para ver el producto.
            </p>
          </>
        );
      }}
    </QueryView>
  );
}

// --- drill-down -----------------------------------------------------------------------------------

function ProductDetail({ productId }: { productId: string }) {
  const oversell = useOversell();
  const row = oversell.data?.rows.find((candidate) => candidate.product.id === productId);
  if (!row) return null;
  const uncovered = !isZero(row.uncovered.quantity);
  return (
    <Panel
      title={
        <span>
          Detalle:{' '}
          <EntityLink to="product" id={row.product.id}>
            {row.product.name}
          </EntityLink>
        </span>
      }
      description="Todo lo confirmado de este producto, sin importar los demás filtros."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <CoverageGauge
            sold={row.sold}
            onHand={row.onHand}
            producible={row.producible}
            uncovered={row.uncovered}
          />
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-ink-3">Vendido</dt>
              <dd>
                <Qty value={row.sold} emphasis />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Capacidad</dt>
              <dd>
                <Qty value={row.capacity} emphasis />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Sin cobertura</dt>
              <dd>
                <Qty
                  value={row.uncovered}
                  emphasis
                  dimZero
                  className={uncovered ? 'text-critical' : ''}
                />
              </dd>
            </div>
          </dl>
          {row.limitingMaterial && uncovered ? (
            <p className="mt-3 text-[13px] text-ink-3">
              Limita la producción:{' '}
              <EntityLink to="product" id={row.limitingMaterial.id}>
                {row.limitingMaterial.name}
              </EntityLink>
            </p>
          ) : null}
        </div>
        {uncovered ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">
              Para cubrir el faltante hay que comprar
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
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
    </Panel>
  );
}

// --- lists ----------------------------------------------------------------------------------------

function AttentionTable({ atRisk }: { atRisk: OrderCoverage[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? atRisk : atRisk.slice(0, 10);
  return (
    <Panel
      title="Atención hoy"
      description="Preventas atrasadas o sin insumos suficientes, con los filtros aplicados."
      flush
    >
      {atRisk.length === 0 ? (
        <EmptyState
          icon={<CircleCheck />}
          title="Nada en riesgo"
          description="Ninguna preventa de esta vista está atrasada ni le faltan insumos."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/70 text-left text-[12.5px] text-ink-2">
                  <th className="px-4 py-2.5 font-medium">Preventa</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Entrega</th>
                  <th className="px-4 py-2.5 font-medium">Qué falta</th>
                  <th className="px-4 py-2.5 font-medium">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr key={order.orderId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <EntityLink to="order" id={order.orderId} className="font-medium">
                        {order.label}
                      </EntityLink>
                      <span className="block text-[12px] text-ink-3">{order.seller.name}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <EntityLink to="customer" id={order.customerId}>
                        {order.customerName}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-2.5">
                      <DueDate date={order.estimatedDeliveryDate} />
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-ink-2">
                      {order.lines
                        .filter((line) => line.status === 'SHORT')
                        .map((line) => (
                          <span key={line.product.id} className="block">
                            {line.product.code}:{' '}
                            <Qty value={line.uncovered} className="text-critical" />
                          </span>
                        ))}
                      {order.status !== 'SHORT' ? (
                        <span className="text-ink-3">Hay stock: despachar</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <CoverageChip status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((order) => (
              <li key={order.orderId} className="px-4 py-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <EntityLink to="order" id={order.orderId} className="font-medium">
                    {order.label}
                  </EntityLink>
                  <span className="text-[13px] text-ink-2">{order.customerName}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                  <DueDate date={order.estimatedDeliveryDate} />
                  <CoverageChip status={order.status} />
                </div>
              </li>
            ))}
          </ul>
          {atRisk.length > 10 ? (
            <button
              type="button"
              onClick={() => {
                setAll((value) => !value);
              }}
              className="w-full border-t border-line px-4 py-3 text-left text-sm font-medium text-brand hover:bg-surface-2/60"
            >
              {all ? 'Ver menos' : `Ver las ${String(atRisk.length)}`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** Materials to buy, ranked by how many at-risk orders (in this view) wait on them. */
function BuyFirst({ atRisk }: { atRisk: OrderCoverage[] }) {
  const needs = usePurchaseNeeds();
  const production = useProductionNeeds();
  return (
    <Panel
      title="Qué comprar primero"
      description="Insumos por comprar, primero los que detienen más preventas de esta vista."
      actions={
        <Link to="/compras" className="text-sm font-medium text-brand hover:underline">
          Ir a compras
        </Link>
      }
      flush
    >
      <QueryView query={needs}>
        {(data) => {
          // A chemical feeds a bulk, and the bulk feeds finished goods: follow the chain.
          const bulkUsers = new Map(
            (production.data?.bulk ?? []).map((bulk) => [
              bulk.product.id,
              bulk.usedBy.map((p) => p.id),
            ]),
          );
          const shortOrders = new Map<string, number>();
          for (const order of atRisk)
            for (const line of order.lines)
              if (line.status === 'SHORT')
                shortOrders.set(line.product.id, (shortOrders.get(line.product.id) ?? 0) + 1);
          const blocks = (need: PurchaseNeed) => {
            const finished = new Set(
              need.usedBy.flatMap((p) => [p.id, ...(bulkUsers.get(p.id) ?? [])]),
            );
            return [...finished].reduce((sum, id) => sum + (shortOrders.get(id) ?? 0), 0);
          };
          const toBuy = data.rows.filter((need) => !isZero(need.toBuy.quantity));
          const ranked = toBuy
            .map((need) => ({ need, count: blocks(need) }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 7);
          return ranked.length === 0 ? (
            <EmptyState
              icon={<CircleCheck />}
              title="No falta nada por comprar"
              description="Lo que hay y lo que viene en camino cubre todo lo vendido."
            />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {ranked.map(({ need, count }) => (
                  <li key={need.product.id} className="flex items-start gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <EntityLink to="product" id={need.product.id} className="font-medium">
                        {need.product.name}
                      </EntityLink>
                      <p className="text-[12.5px] text-ink-3">
                        {count > 0 ? `Frena ${ordersLabel(count)}` : 'Para lo vendido'}
                        {need.inTransit.length > 0 ? (
                          <>
                            {' · en camino '}
                            <Qty value={need.onOrder} className="text-ink-3" />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Qty value={need.toBuy} emphasis />
                  </li>
                ))}
              </ul>
              {toBuy.length > ranked.length ? (
                <Link
                  to="/compras"
                  className="block border-t border-line px-5 py-3 text-sm font-medium text-brand hover:bg-surface-2/60"
                >
                  Y {plural(toBuy.length - ranked.length, 'insumo más', 'insumos más')}
                </Link>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Panel>
  );
}

function Delays() {
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
              <span className="text-ink-2">· {order.supplier.name}</span>
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
            </div>
            <DueDate date={order.scheduledDate} lateLabel="Sin producir" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
