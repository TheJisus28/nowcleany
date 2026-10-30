import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDollarSign,
  Factory,
  Inbox,
  PackageOpen,
  ReceiptText,
  Search,
  Split,
  StickyNote,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useOrderCoverage, useOrders, useProducts } from '../../api/hooks';
import type {
  CoverageLine,
  CoverageStatus,
  Invoice,
  OrderCoverage,
  SalesOrder,
} from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { Kpi } from '../../components/kpi';
import { EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { COVERAGE, CoverageChip, DueDate, OrderStatusChip } from '../../components/status';
import {
  Button,
  cn,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Select,
} from '../../components/ui';
import { daysUntil, formatCop, formatCopShort, formatDate, isZero, plural } from '../../lib/format';
import { amountFor, colombiaDay, normalizeText, sumPesos, withVat } from './billing-format';

type CoverageFilter = 'all' | CoverageStatus;

/** What the consolidator decides per order before invoicing it. */
interface Draft {
  priority: string;
  allowPartial: boolean;
}

const EMPTY_DRAFT: Draft = { priority: '', allowPartial: false };

/** A priority as typed: 1–9999, empty for none. */
function parsePriority(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d{1,4}$/.test(text)) return 'invalid';
  const value = Number(text);
  return value >= 1 ? value : 'invalid';
}

const normalize = normalizeText;

const amount = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 2 });

/** Sold, from stock, to produce and to buy across the lines of an order (display only). */
function coverageTotals(lines: readonly CoverageLine[]) {
  const totals = { quantity: 0, stock: 0, production: 0, uncovered: 0 };
  for (const line of lines) {
    totals.quantity += Number(line.quantity.quantity);
    totals.stock += Number(line.fromStock.quantity);
    totals.production += Number(line.fromProduction.quantity);
    totals.uncovered += Number(line.uncovered.quantity);
  }
  const units = new Set(lines.map((line) => line.quantity.unit));
  const unit = units.size === 1 ? (lines[0]?.quantity.unit ?? '') : '';
  return { ...totals, unit: unit === 'un' ? 'und' : unit };
}

/** Earliest in the stock queue first (the order the server assigns stock in). */
function byQueue(coverage: ReadonlyMap<string, OrderCoverage>) {
  return (a: SalesOrder, b: SalesOrder) => {
    const rankA = coverage.get(a.id)?.priority ?? Number.MAX_SAFE_INTEGER;
    const rankB = coverage.get(b.id)?.priority ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    if (a.priority !== b.priority) {
      if (a.priority === null) return 1;
      if (b.priority === null) return -1;
      return a.priority - b.priority;
    }
    const dateA = a.estimatedDeliveryDate ?? '9999-12-31';
    const dateB = b.estimatedDeliveryDate ?? '9999-12-31';
    return dateA.localeCompare(dateB) || a.label.localeCompare(b.label);
  };
}

interface OrderValue {
  total: bigint;
  /** Codes of products without a sale price (the API refuses to invoice them). */
  missing: string[];
}

/** Estimated invoice value (VAT included) at list prices; null while prices load. */
function useOrderValues(orders: readonly SalesOrder[] | undefined) {
  const products = useProducts();
  return useMemo(() => {
    if (!products.data || !orders) return null;
    const prices = new Map<string, string | null>(
      products.data.map((product) => [product.id, product.price]),
    );
    return new Map<string, OrderValue>(
      orders.map((order) => {
        const missing: string[] = [];
        const subtotal = order.lines.reduce((sum, line) => {
          const price = prices.get(line.productId);
          if (!price) {
            missing.push(line.productCode);
            return sum;
          }
          return sum + amountFor(line.quantity.quantity, price);
        }, 0n);
        return [order.id, { total: withVat(subtotal), missing }];
      }),
    );
  }, [products.data, orders]);
}

type OrderValues = ReturnType<typeof useOrderValues>;

// --- page ---------------------------------------------------------------------------------------

export function ConsolidationPage() {
  const { can } = useSession();
  const canIssue = can('invoices:issue');
  const pending = useOrders({ status: 'CONFIRMED', limit: '500' });
  const invoiced = useOrders({ status: 'INVOICED,READY,PARTIAL', limit: '500' });
  const coverage = useOrderCoverage();
  const values = useOrderValues(pending.data);
  const coverageById = useMemo(
    () => new Map<string, OrderCoverage>((coverage.data ?? []).map((row) => [row.orderId, row])),
    [coverage.data],
  );
  const [issued, setIssued] = useState<Invoice[]>([]);

  return (
    <>
      <PageHeader
        title="Consolidado"
        description="Las preventas que enviaron los vendedores, con lo que alcanza a cubrir el stock. Se facturan siempre: lo que falte pasa a planta y compras."
      />
      <Indicators
        pending={pending.data}
        invoiced={invoiced.data}
        coverage={coverageById}
        values={values}
      />
      {issued.length > 0 ? (
        <IssuedNotice
          invoices={issued}
          onDismiss={() => {
            setIssued([]);
          }}
        />
      ) : null}
      <Panel
        flush
        title="Por consolidar"
        description={
          canIssue
            ? 'Elige las preventas a facturar. La prioridad (1 primero) decide qué factura se lleva primero el stock.'
            : 'Preventas enviadas por los vendedores, en el orden en que tomarían el stock.'
        }
      >
        <QueryView query={pending}>
          {(orders) => (
            <ConsolidationInbox
              orders={orders}
              coverage={coverageById}
              coverageLoading={coverage.isPending}
              values={values}
              canIssue={canIssue}
              onIssued={setIssued}
            />
          )}
        </QueryView>
      </Panel>
      <Panel
        flush
        className="mt-6"
        title="Facturadas pendientes de despacho"
        description="En este orden se reparte el stock disponible entre planta y logística. Sube o baja un pedido, o escribe su prioridad; sin prioridad, va por fecha de entrega."
      >
        <QueryView query={invoiced}>
          {(orders) => (
            <DispatchQueue orders={orders} coverage={coverageById} canIssue={canIssue} />
          )}
        </QueryView>
      </Panel>
    </>
  );
}

function Indicators({
  pending,
  invoiced,
  coverage,
  values,
}: {
  pending: SalesOrder[] | undefined;
  invoiced: SalesOrder[] | undefined;
  coverage: ReadonlyMap<string, OrderCoverage>;
  values: OrderValues;
}) {
  const stats = useMemo(() => {
    if (!pending) return null;
    const customers = new Set(pending.map((order) => order.customer.id)).size;
    const late = pending.filter(
      (order) => (daysUntil(order.estimatedDeliveryDate) ?? 0) < 0,
    ).length;
    let missingUnits = 0;
    let toProduce = 0;
    let toBuy = 0;
    for (const order of pending) {
      const row = coverage.get(order.id);
      if (!row) continue;
      if (row.status === 'NEEDS_PRODUCTION') toProduce++;
      if (row.status === 'SHORT') toBuy++;
      for (const line of row.lines) {
        if (line.quantity.unit !== 'un') continue;
        missingUnits += Number(line.fromProduction.quantity) + Number(line.uncovered.quantity);
      }
    }
    const total = values ? sumPesos([...values.values()].map((value) => value.total)) : null;
    return { customers, late, missingUnits, toProduce, toBuy, total };
  }, [pending, coverage, values]);

  const ready = invoiced?.filter((order) => order.status === 'READY').length ?? 0;
  const total = stats?.total ?? null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Por consolidar"
        value={pending ? pending.length : '—'}
        icon={Inbox}
        tone="brand"
        hint={
          stats
            ? stats.late > 0
              ? `${plural(stats.customers, 'cliente', 'clientes')} · ${String(stats.late)} con entrega vencida`
              : `De ${plural(stats.customers, 'cliente', 'clientes')}`
            : undefined
        }
      />
      <Kpi
        label="Valor por facturar"
        value={
          total !== null ? (
            <span title={formatCop(total.toString())}>{formatCopShort(total.toString())}</span>
          ) : (
            '—'
          )
        }
        icon={CircleDollarSign}
        hint="Estimado con IVA, a precio de lista"
      />
      <Kpi
        label="Unidades sin stock"
        value={stats ? amount(Math.ceil(stats.missingUnits)) : '—'}
        icon={PackageOpen}
        tone={stats && stats.missingUnits > 0 ? 'warning' : 'good'}
        hint={
          stats
            ? stats.toProduce + stats.toBuy > 0
              ? `${String(stats.toProduce)} requieren producción · ${String(stats.toBuy)} falta comprar`
              : 'Todo sale del stock'
            : undefined
        }
      />
      <Kpi
        label="Facturadas por despachar"
        value={invoiced ? invoiced.length : '—'}
        icon={Truck}
        hint={invoiced ? `${plural(ready, 'lista', 'listas')} para despacho` : undefined}
      />
    </div>
  );
}

function IssuedNotice({ invoices, onDismiss }: { invoices: Invoice[]; onDismiss: () => void }) {
  const total = sumPesos(invoices.map((invoice) => invoice.total));
  const withPending = invoices.filter((invoice) => invoice.hasPending).length;
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-[10px] border border-good/30 bg-good-soft px-4 py-3 text-sm"
    >
      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {invoices.length === 1
            ? 'Se emitió 1 factura'
            : `Se emitieron ${String(invoices.length)} facturas`}{' '}
          por {formatCop(total.toString())}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink-2">
          {invoices.map((invoice) => (
            <span key={invoice.id}>
              <EntityLink to="invoice" id={invoice.id} className="font-medium text-ink">
                {invoice.label}
              </EntityLink>{' '}
              · {invoice.customer.name}
            </span>
          ))}
        </p>
        {withPending > 0 ? (
          <p className="mt-1 text-ink-2">
            {withPending === 1
              ? '1 quedó con producto pendiente:'
              : `${String(withPending)} quedaron con producto pendiente:`}{' '}
            planta y compras ya lo tienen en su lista.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="-m-1 rounded-md p-1 text-ink-3 hover:bg-surface hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// --- inbox --------------------------------------------------------------------------------------

function ConsolidationInbox({
  orders,
  coverage,
  coverageLoading,
  values,
  canIssue,
  onIssued,
}: {
  orders: SalesOrder[];
  coverage: ReadonlyMap<string, OrderCoverage>;
  coverageLoading: boolean;
  values: OrderValues;
  canIssue: boolean;
  onIssued: (invoices: Invoice[]) => void;
}) {
  const [filter, setFilter] = useState<CoverageFilter>('all');
  const [search, setSearch] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft | undefined>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const query = normalize(useDeferredValue(search).trim());

  const sorted = useMemo(() => [...orders].sort(byQueue(coverage)), [orders, coverage]);
  const sellers = useMemo(
    () =>
      [
        ...new Map<string, string>(
          orders.map((order) => [order.seller.id, order.seller.name]),
        ).entries(),
      ].sort(([, a], [, b]) => a.localeCompare(b)),
    [orders],
  );
  const matching = sorted.filter(
    (order) =>
      (!sellerId || order.seller.id === sellerId) &&
      (!query ||
        normalize(
          [
            order.label,
            order.customer.name,
            order.customer.documentNumber,
            order.branch.name,
            order.branch.city ?? '',
            order.seller.name,
          ].join(' '),
        ).includes(query)),
  );
  const countOf = (status: CoverageStatus) =>
    matching.filter((order) => coverage.get(order.id)?.status === status).length;
  const visible =
    filter === 'all'
      ? matching
      : matching.filter((order) => coverage.get(order.id)?.status === filter);

  const draftOf = (id: string): Draft => drafts[id] ?? EMPTY_DRAFT;
  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? EMPTY_DRAFT), ...patch } }));
  };
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen = sorted.filter((order) => selected.has(order.id));
  const chosenWithPending = chosen.filter((order) => {
    const row = coverage.get(order.id);
    return row !== undefined && row.status !== 'COVERED';
  });
  const invalidPriority = chosen.some(
    (order) => parsePriority(draftOf(order.id).priority) === 'invalid',
  );
  const chosenTotal = values
    ? sumPesos(chosen.map((order) => values.get(order.id)?.total ?? 0n))
    : null;
  const allVisibleChosen = visible.length > 0 && visible.every((order) => selected.has(order.id));
  const someVisibleChosen = visible.some((order) => selected.has(order.id));

  const issue = useAction(
    (body: { orders: { orderId: string; allowPartial: boolean; priority?: number }[] }) =>
      api.post<Invoice[]>('/v1/invoices', body),
    {
      success: (result) =>
        result.length === 1
          ? `${result[0]?.label ?? 'Factura'} emitida`
          : `${String(result.length)} facturas emitidas`,
    },
  );

  const submit = () => {
    const payload = chosen.map((order) => {
      const draft = draftOf(order.id);
      const priority = parsePriority(draft.priority);
      return {
        orderId: order.id,
        allowPartial: draft.allowPartial,
        ...(typeof priority === 'number' ? { priority } : {}),
      };
    });
    issue.mutate(
      { orders: payload },
      {
        onSuccess: (result) => {
          onIssued(result);
          setSelected(new Set());
          const invoicedIds = new Set(chosen.map((order) => order.id));
          setDrafts((current) =>
            Object.fromEntries(Object.entries(current).filter(([id]) => !invoicedIds.has(id))),
          );
          setConfirming(false);
        },
      },
    );
  };

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No hay preventas por consolidar"
        description="Cuando un vendedor envíe una preventa al consolidado, aparece aquí con su cobertura de stock."
      />
    );
  }

  const grid = canIssue
    ? 'grid-cols-[1.25rem_minmax(0,1fr)] lg:grid-cols-[1.25rem_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.5fr)_minmax(0,0.95fr)_4.5rem_4.5rem_2rem]'
    : 'grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,1.5fr)_minmax(0,0.95fr)_2rem]';

  const filters: { value: CoverageFilter; label: string }[] = [
    { value: 'all', label: `Todas (${String(matching.length)})` },
    { value: 'COVERED', label: `Cubiertas (${String(countOf('COVERED'))})` },
    { value: 'NEEDS_PRODUCTION', label: `Producción (${String(countOf('NEEDS_PRODUCTION'))})` },
    { value: 'SHORT', label: `Falta comprar (${String(countOf('SHORT'))})` },
  ];

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 xl:flex-row xl:items-center">
        <label className="relative block xl:w-72">
          <span className="sr-only">Buscar preventa</span>
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Preventa, cliente, sucursal o vendedor"
            className="pl-9"
          />
        </label>
        <div className="sm:w-52">
          <Select
            aria-label="Vendedor"
            value={sellerId}
            onChange={(event) => {
              setSellerId(event.target.value);
            }}
          >
            <option value="">Todos los vendedores</option>
            {sellers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="overflow-x-auto xl:ml-auto">
          <Segmented label="Cobertura" value={filter} options={filters} onChange={setFilter} />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="Ninguna preventa coincide"
          description="Cambia la búsqueda, el vendedor o el filtro de cobertura."
        />
      ) : (
        <>
          <div
            className={cn(
              'hidden items-center gap-x-4 border-b border-line bg-surface-2/70 px-4 py-2.5 text-[12.5px] font-medium text-ink-2 lg:grid',
              grid,
            )}
          >
            {canIssue ? (
              <SelectAll
                checked={allVisibleChosen}
                indeterminate={!allVisibleChosen && someVisibleChosen}
                onChange={(checked) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    for (const order of visible) {
                      if (checked) next.add(order.id);
                      else next.delete(order.id);
                    }
                    return next;
                  });
                }}
              />
            ) : null}
            <span>Preventa y cliente</span>
            <span>Vendedor</span>
            <span>Entrega prometida</span>
            <span>Cobertura del stock</span>
            <span className="text-right">Valor estimado</span>
            {canIssue ? (
              <>
                <span className="text-center" title="1 se lleva primero el stock">
                  Prioridad
                </span>
                <span className="text-center" title="Permitir despacho parcial">
                  Parcial
                </span>
              </>
            ) : null}
            <span className="sr-only">Detalle</span>
          </div>
          {canIssue ? (
            <label className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 text-[13px] text-ink-2 lg:hidden">
              <SelectAll
                checked={allVisibleChosen}
                indeterminate={!allVisibleChosen && someVisibleChosen}
                onChange={(checked) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    for (const order of visible) {
                      if (checked) next.add(order.id);
                      else next.delete(order.id);
                    }
                    return next;
                  });
                }}
              />
              Seleccionar todas ({visible.length})
            </label>
          ) : null}
          <ul aria-label="Preventas por consolidar">
            {visible.map((order) => (
              <InboxRow
                key={order.id}
                order={order}
                grid={grid}
                coverage={coverage.get(order.id)}
                coverageLoading={coverageLoading}
                value={values?.get(order.id)}
                draft={draftOf(order.id)}
                onDraft={(patch) => {
                  setDraft(order.id, patch);
                }}
                canIssue={canIssue}
                selected={selected.has(order.id)}
                onToggle={() => {
                  toggle(order.id);
                }}
                expanded={expanded.has(order.id)}
                onExpand={() => {
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(order.id)) next.delete(order.id);
                    else next.add(order.id);
                    return next;
                  });
                }}
              />
            ))}
          </ul>
        </>
      )}

      {canIssue ? (
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b-[10px] border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {chosen.length === 0 ? (
              <span className="text-ink-2">
                Selecciona las preventas que vas a facturar (una factura por preventa).
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">
                  {plural(chosen.length, 'preventa seleccionada', 'preventas seleccionadas')}
                </span>
                {chosenTotal !== null ? (
                  <span className="text-ink-2 tabular-nums">
                    {formatCop(chosenTotal.toString())} con IVA
                  </span>
                ) : null}
                {chosenWithPending.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <Factory aria-hidden className="size-3.5 text-[#b67d00]" strokeWidth={2.25} />
                    {plural(chosenWithPending.length, 'con pendiente', 'con pendiente')}
                  </span>
                ) : null}
                {invalidPriority ? (
                  <span className="text-critical">Revisa la prioridad: un número de 1 a 9999.</span>
                ) : null}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {chosen.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(new Set());
                }}
              >
                Limpiar
              </Button>
            ) : null}
            <Button
              icon={<ReceiptText className="size-4" />}
              loading={issue.isPending}
              disabled={chosen.length === 0 || invalidPriority || issue.isPending}
              onClick={() => {
                if (chosenWithPending.length > 0) setConfirming(true);
                else submit();
              }}
              className="flex-1 sm:flex-none"
            >
              Facturar seleccionadas{chosen.length > 0 ? ` (${String(chosen.length)})` : ''}
            </Button>
          </div>
        </div>
      ) : null}

      <PendingConfirmation
        open={confirming}
        chosen={chosen}
        withPending={chosenWithPending}
        coverage={coverage}
        drafts={drafts}
        loading={issue.isPending}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={submit}
      />
    </>
  );
}

function SelectAll({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Seleccionar todas las preventas visibles"
      checked={checked}
      onChange={(event) => {
        onChange(event.target.checked);
      }}
      className="size-4 cursor-pointer accent-brand"
    />
  );
}

/** A mobile label over a value; on wide screens the column header names it. */
function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 text-sm', className)}>
      <p className="text-[12px] text-ink-3 lg:hidden">{label}</p>
      {children}
    </div>
  );
}

function InboxRow({
  order,
  grid,
  coverage,
  coverageLoading,
  value,
  draft,
  onDraft,
  canIssue,
  selected,
  onToggle,
  expanded,
  onExpand,
}: {
  order: SalesOrder;
  grid: string;
  coverage: OrderCoverage | undefined;
  coverageLoading: boolean;
  value: OrderValue | undefined;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  canIssue: boolean;
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  const priorityInvalid = parsePriority(draft.priority) === 'invalid';
  const totals = coverage ? coverageTotals(coverage.lines) : null;
  return (
    <li
      className={cn(
        'border-b border-line transition-colors last:border-b-0',
        selected && 'bg-brand-soft/45',
      )}
    >
      <div className={cn('grid items-start gap-x-4 gap-y-3 px-4 py-3.5 lg:items-center', grid)}>
        {canIssue ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Seleccionar ${order.label}`}
            className="mt-1 size-4 cursor-pointer accent-brand lg:mt-0"
          />
        ) : null}

        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2">
            <EntityLink to="order" id={order.id} className="font-semibold">
              {order.label}
            </EntityLink>
            {order.notes ? (
              <span title={order.notes} className="inline-flex text-ink-3">
                <StickyNote aria-label="Tiene notas" className="size-3.5" />
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm">
            <EntityLink to="customer" id={order.customer.id}>
              {order.customer.name}
            </EntityLink>
          </p>
          <p className="truncate text-[12.5px] text-ink-3">
            {order.branch.name}
            {order.branch.city ? ` · ${order.branch.city}` : ''}
          </p>
        </div>

        <div
          className={cn(
            'flex flex-wrap items-start gap-x-6 gap-y-3 lg:contents',
            canIssue && 'col-start-2',
          )}
        >
          <Cell label="Vendedor">
            <p className="truncate">{order.seller.name}</p>
            {order.confirmedAt ? (
              <p className="text-[12.5px] text-ink-3">
                Enviada {formatDate(colombiaDay(order.confirmedAt))}
              </p>
            ) : null}
          </Cell>

          <Cell label="Entrega prometida">
            <DueDate date={order.estimatedDeliveryDate} lateLabel="Atrasada" />
            <p className="text-[12.5px] text-ink-3">{formatDate(order.estimatedDeliveryDate)}</p>
          </Cell>

          <Cell label="Cobertura del stock" className="w-full sm:w-auto lg:w-full">
            {coverage && totals ? (
              <div className="flex flex-col items-start gap-1.5">
                <CoverageChip status={coverage.status} />
                <CoverageBar totals={totals} />
                <p className="text-[12.5px] text-ink-3 tabular-nums">
                  {amount(totals.stock)} de {amount(totals.quantity)} {totals.unit} del stock
                </p>
              </div>
            ) : (
              <span className="text-[13px] text-ink-3">
                {coverageLoading ? 'Calculando…' : 'Sin datos de cobertura'}
              </span>
            )}
          </Cell>

          <Cell label="Valor estimado" className="lg:text-right">
            {value === undefined ? (
              <span className="text-ink-3">…</span>
            ) : value.missing.length > 0 ? (
              <span
                className="inline-flex items-center gap-1 text-[13px] text-critical"
                title={`Sin precio de venta: ${value.missing.join(', ')}`}
              >
                <TriangleAlert aria-hidden className="size-3.5" />
                Sin precio
              </span>
            ) : (
              <span className="font-medium tabular-nums">{formatCop(value.total.toString())}</span>
            )}
          </Cell>

          {canIssue ? (
            <>
              <Cell label="Prioridad" className="lg:flex lg:justify-center">
                <Input
                  aria-label={`Prioridad de ${order.label}`}
                  inputMode="numeric"
                  value={draft.priority}
                  placeholder="—"
                  aria-invalid={priorityInvalid ? true : undefined}
                  title="1 se lleva primero el stock"
                  onChange={(event) => {
                    onDraft({ priority: event.target.value.replace(/\s/g, '').slice(0, 4) });
                  }}
                  className="h-8 w-16 px-2 text-center tabular-nums"
                />
              </Cell>
              <label className="flex cursor-pointer items-center gap-2 self-center text-[13px] lg:justify-center">
                <input
                  type="checkbox"
                  checked={draft.allowPartial}
                  onChange={(event) => {
                    onDraft({ allowPartial: event.target.checked });
                  }}
                  className="size-4 cursor-pointer accent-brand"
                />
                <span className="lg:sr-only">Permitir despacho parcial</span>
              </label>
            </>
          ) : null}

          <button
            type="button"
            onClick={onExpand}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Ocultar' : 'Ver'} líneas de ${order.label}`}
            className="inline-flex items-center gap-1 self-center rounded-md px-1.5 py-1 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink lg:justify-self-center"
          >
            <span className="lg:hidden">
              {expanded ? 'Ocultar líneas' : `Ver líneas (${String(order.lines.length)})`}
            </span>
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        </div>

        {expanded ? (
          <div className="col-span-full overflow-hidden rounded-lg border border-line bg-surface">
            <OrderLines order={order} coverage={coverage} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

const SEGMENTS = [
  { key: 'stock', label: 'Del stock', fill: 'bg-good' },
  { key: 'production', label: COVERAGE.NEEDS_PRODUCTION.label, fill: 'bg-warning' },
  { key: 'uncovered', label: COVERAGE.SHORT.label, fill: 'bg-critical' },
] as const;

/** How the order splits between stock, production and purchases (the chip names the state). */
function CoverageBar({ totals }: { totals: ReturnType<typeof coverageTotals> }) {
  const whole = Math.max(totals.stock + totals.production + totals.uncovered, 1);
  const visible = SEGMENTS.filter((segment) => totals[segment.key] > 0);
  return (
    <div
      role="img"
      aria-label={SEGMENTS.map(
        (segment) => `${segment.label}: ${amount(totals[segment.key])} ${totals.unit}`,
      ).join(', ')}
      className="flex h-1.5 w-full max-w-56 gap-[2px] overflow-hidden rounded-[4px] bg-surface-2"
    >
      {visible.map((segment) => (
        <span
          key={segment.key}
          title={`${segment.label}: ${amount(totals[segment.key])} ${totals.unit}`}
          className={cn('h-full min-w-[3px]', segment.fill)}
          style={{ flexGrow: totals[segment.key] / whole }}
        />
      ))}
    </div>
  );
}

function OrderLines({
  order,
  coverage,
}: {
  order: SalesOrder;
  coverage: OrderCoverage | undefined;
}) {
  if (!coverage) {
    return (
      <DataTable
        label={`Líneas de ${order.label}`}
        rows={order.lines}
        rowKey={(line) => line.productId}
        columns={[
          {
            key: 'product',
            header: 'Producto',
            render: (line) => (
              <ProductCell
                product={{ id: line.productId, code: line.productCode, name: line.productName }}
              />
            ),
          },
          {
            key: 'quantity',
            header: 'Pedido',
            align: 'right',
            render: (line) => <Qty value={line.quantity} />,
          },
        ]}
      />
    );
  }
  return (
    <DataTable<CoverageLine>
      label={`Cobertura por línea de ${order.label}`}
      rows={coverage.lines}
      rowKey={(line) => line.product.id}
      columns={[
        {
          key: 'product',
          header: 'Producto',
          render: (line) => <ProductCell product={line.product} />,
        },
        {
          key: 'quantity',
          header: 'Pedido',
          align: 'right',
          render: (line) => <Qty value={line.quantity} emphasis />,
        },
        {
          key: 'stock',
          header: 'Del stock',
          align: 'right',
          render: (line) => <Qty value={line.fromStock} dimZero />,
        },
        {
          key: 'production',
          header: 'Requiere producción',
          align: 'right',
          render: (line) => <Qty value={line.fromProduction} dimZero />,
        },
        {
          key: 'uncovered',
          header: 'Falta comprar',
          align: 'right',
          render: (line) => (
            <Qty
              value={line.uncovered}
              dimZero
              emphasis={!isZero(line.uncovered.quantity)}
              className={isZero(line.uncovered.quantity) ? '' : 'text-critical'}
            />
          ),
        },
        {
          key: 'status',
          header: 'Estado',
          render: (line) => <CoverageChip status={line.status} />,
        },
      ]}
    />
  );
}

function PendingConfirmation({
  open,
  chosen,
  withPending,
  coverage,
  drafts,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  chosen: SalesOrder[];
  withPending: SalesOrder[];
  coverage: ReadonlyMap<string, OrderCoverage>;
  drafts: Record<string, Draft | undefined>;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Facturar con producto pendiente"
      description={`${plural(withPending.length, 'preventa tiene', 'preventas tienen')} producto que el stock no cubre hoy.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button icon={<ReceiptText className="size-4" />} loading={loading} onClick={onConfirm}>
            Facturar {plural(chosen.length, 'preventa', 'preventas')}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-[#b67d00]"
          strokeWidth={2.25}
        />
        <p>
          <strong className="font-semibold">Se facturan igual.</strong> Lo que el stock no cubre
          queda <strong className="font-semibold">pendiente por fabricar o comprar</strong>: planta
          lo ve en sus necesidades de producción, compras en lo que hay que comprar, y la traza deja
          registrado que la factura salió con pendiente.
        </p>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {withPending.map((order) => {
          const row = coverage.get(order.id);
          const partial = drafts[order.id]?.allowPartial ?? false;
          return (
            <li key={order.id} className="rounded-lg border border-line px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold">{order.label}</span>
                  <span className="text-ink-2"> · {order.customer.name}</span>
                </p>
                {row ? <CoverageChip status={row.status} /> : null}
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-2">
                {(row?.lines ?? [])
                  .filter((line) => line.status !== 'COVERED')
                  .map((line) => (
                    <li key={line.product.id} className="flex flex-wrap gap-x-2">
                      <span className="font-medium text-ink">{line.product.name}</span>
                      {!isZero(line.fromProduction.quantity) ? (
                        <span>
                          · <Qty value={line.fromProduction} /> por producir
                        </span>
                      ) : null}
                      {!isZero(line.uncovered.quantity) ? (
                        <span>
                          · <Qty value={line.uncovered} /> por comprar
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <Split aria-hidden className="size-3.5" />
                {partial
                  ? 'Despacho parcial permitido: planta puede entregar ya lo que hay en stock.'
                  : 'Sin despacho parcial: se despacha completo cuando todo esté listo.'}
              </p>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

// --- invoiced, waiting for dispatch -------------------------------------------------------------

interface QueueRow {
  order: SalesOrder;
  index: number;
}

function DispatchQueue({
  orders,
  coverage,
  canIssue,
}: {
  orders: SalesOrder[];
  coverage: ReadonlyMap<string, OrderCoverage>;
  canIssue: boolean;
}) {
  const sorted = useMemo(() => [...orders].sort(byQueue(coverage)), [orders, coverage]);
  const rows: QueueRow[] = sorted.map((order, index) => ({ order, index }));

  const reorder = useAction(
    async (changes: { id: string; priority: number | null }[]) => {
      for (const change of changes) {
        await api.patch(`/v1/sales-orders/${change.id}/priority`, { priority: change.priority });
      }
      return changes;
    },
    { success: 'Prioridad actualizada: el stock se reparte en el nuevo orden' },
  );

  /** Moves an order one place and numbers the queue 1..n (only orders whose number changes). */
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    const current = sorted[index];
    const other = sorted[target];
    if (!current || !other) return;
    const next = [...sorted];
    next[index] = other;
    next[target] = current;
    const changes = next
      .map((order, position) => ({ id: order.id, priority: position + 1, was: order.priority }))
      .filter((change) => change.was !== change.priority)
      .map(({ id, priority }) => ({ id, priority }));
    if (changes.length > 0) reorder.mutate(changes);
  };

  return (
    <DataTable<QueueRow>
      label="Facturadas pendientes de despacho"
      rows={rows}
      rowKey={(row) => row.order.id}
      empty={
        <EmptyState
          icon={<Truck />}
          title="No hay facturas esperando despacho"
          description="Las preventas facturadas quedan aquí hasta que logística las despacha completas."
        />
      }
      columns={[
        {
          key: 'order',
          header: 'Turno y pedido',
          render: ({ order, index }) => (
            <span className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand tabular-nums"
                title="Turno para tomar el stock"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <EntityLink to="order" id={order.id} className="font-semibold">
                  {order.label}
                </EntityLink>
                <span className="block truncate text-[13px] font-normal text-ink-2">
                  {order.customer.name}
                </span>
              </span>
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Estado',
          render: ({ order }) => <OrderStatusChip status={order.status} />,
        },
        {
          key: 'coverage',
          header: 'Stock hoy',
          render: ({ order }) => {
            const row = coverage.get(order.id);
            return row ? (
              <CoverageChip status={row.status} />
            ) : (
              <span className="text-ink-3">—</span>
            );
          },
        },
        {
          key: 'delivery',
          header: 'Entrega',
          render: ({ order }) => (
            <DueDate date={order.estimatedDeliveryDate} lateLabel="Atrasada" />
          ),
        },
        {
          key: 'partial',
          header: 'Despacho parcial',
          hideOnMobile: true,
          render: ({ order }) =>
            order.allowPartial ? (
              <span className="inline-flex items-center gap-1.5">
                <Split aria-hidden className="size-3.5 text-ink-3" />
                Permitido
              </span>
            ) : (
              <span className="text-ink-3">No</span>
            ),
        },
        {
          key: 'invoiced',
          header: 'Facturada',
          hideOnMobile: true,
          render: ({ order }) => (
            <span className="whitespace-nowrap text-ink-2">
              {order.invoicedAt ? formatDate(colombiaDay(order.invoicedAt)) : '—'}
            </span>
          ),
        },
        {
          key: 'priority',
          header: 'Prioridad',
          align: 'right',
          render: ({ order, index }) =>
            canIssue ? (
              <span className="inline-flex items-center justify-end gap-1">
                <IconButton
                  label={`Subir ${order.label}`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  <ChevronUp className="size-4" />
                </IconButton>
                <IconButton
                  label={`Bajar ${order.label}`}
                  disabled={index === rows.length - 1 || reorder.isPending}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  <ChevronDown className="size-4" />
                </IconButton>
                <PriorityInput
                  value={order.priority}
                  label={`Prioridad de ${order.label}`}
                  disabled={reorder.isPending}
                  onCommit={(priority) => {
                    reorder.mutate([{ id: order.id, priority }]);
                  }}
                />
              </span>
            ) : order.priority === null ? (
              <span className="text-ink-3">Por fecha</span>
            ) : (
              <span className="font-semibold tabular-nums">{order.priority}</span>
            ),
        },
      ]}
    />
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md border border-line text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A stored priority, saved when the field loses focus or on Enter (empty clears it). */
function PriorityInput({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: number | null;
  label: string;
  disabled: boolean;
  onCommit: (priority: number | null) => void;
}) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [synced, setSynced] = useState(shown);
  if (synced !== shown) {
    setSynced(shown);
    setText(shown);
  }
  const parsed = parsePriority(text);
  const commit = () => {
    if (parsed === 'invalid') {
      setText(shown);
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <Input
      aria-label={label}
      title="1 se lleva primero el stock; vacío, por fecha de entrega"
      inputMode="numeric"
      value={text}
      placeholder="—"
      disabled={disabled}
      aria-invalid={parsed === 'invalid' ? true : undefined}
      onChange={(event) => {
        setText(event.target.value.replace(/\s/g, '').slice(0, 4));
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setText(shown);
      }}
      className="h-8 w-16 px-2 text-center tabular-nums"
    />
  );
}
