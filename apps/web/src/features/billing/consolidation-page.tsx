import { CircleCheck, ReceiptText, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useAction, useOrderCoverage, useOrders, useProducts } from '../../api/hooks';
import type { CoverageStatus, Invoice, OrderCoverage, SalesOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { COVERAGE, CoverageChip, DueDate, OrderStatusChip } from '../../components/status';
import { cn, QueryView } from '../../components/ui';
import { formatCop, formatDate, isZero, plural } from '../../lib/format';
import {
  amountFor,
  colombiaDay,
  formatUnits,
  normalizeText,
  sumPesos,
  withVat,
} from './billing-format';
import {
  ConfirmDialog,
  type DocColumn,
  DocTable,
  FILTER_INPUT,
  GridTitle,
  Money,
  ScreenTitle,
} from './erp-kit';

type CoverageFilter = 'all' | CoverageStatus;

/** What the consolidator decides per order before invoicing it. */
interface Decision {
  priority: string;
  allowPartial: boolean;
}

const NO_DECISION: Decision = { priority: '', allowPartial: false };

/** A priority as typed: 1–9999, empty for none. */
function parsePriority(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d{1,4}$/.test(text)) return 'invalid';
  const value = Number(text);
  return value >= 1 ? value : 'invalid';
}

interface Split {
  quantity: number;
  stock: number;
  production: number;
  uncovered: number;
}

/** Sold, from stock, to make and to buy across the lines of an order (display only). */
function splitOf(order: SalesOrder, coverage: OrderCoverage | undefined): Split {
  const split: Split = { quantity: 0, stock: 0, production: 0, uncovered: 0 };
  for (const line of order.lines) split.quantity += Number(line.quantity.quantity);
  for (const line of coverage?.lines ?? []) {
    split.stock += Number(line.fromStock.quantity);
    split.production += Number(line.fromProduction.quantity);
    split.uncovered += Number(line.uncovered.quantity);
  }
  return split;
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

/** Estimated invoice value (VAT included) at list prices; empty while prices load. */
function useOrderValues(orders: readonly SalesOrder[] | undefined) {
  const products = useProducts();
  return useMemo(() => {
    const values = new Map<string, OrderValue>();
    if (!products.data || !orders) return values;
    const prices = new Map(products.data.map((product) => [product.id, product.price]));
    for (const order of orders) {
      const missing: string[] = [];
      const subtotal = order.lines.reduce((sum, line) => {
        const price = prices.get(line.productId);
        if (!price) {
          missing.push(line.productCode);
          return sum;
        }
        return sum + amountFor(line.quantity.quantity, price);
      }, 0n);
      values.set(order.id, { total: withVat(subtotal), missing });
    }
    return values;
  }, [products.data, orders]);
}

/** "Facturación de pedidos": the consolidator invoices what sellers sent, always. */
export function ConsolidationPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const canIssue = can('invoices:issue');
  useWorkTab('Facturación de pedidos');

  const pending = useOrders({ status: 'CONFIRMED', limit: '500' });
  const invoiced = useOrders({ status: 'INVOICED,READY,PARTIAL', limit: '500' });
  const coverage = useOrderCoverage();
  const values = useOrderValues(pending.data);
  const coverageById = useMemo(
    () => new Map<string, OrderCoverage>((coverage.data ?? []).map((row) => [row.orderId, row])),
    [coverage.data],
  );

  const [search, setSearch] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [filter, setFilter] = useState<CoverageFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [decisions, setDecisions] = useState<Record<string, Decision | undefined>>({});
  const [confirming, setConfirming] = useState(false);
  const [issued, setIssued] = useState<Invoice[]>([]);

  const decisionOf = (id: string): Decision => decisions[id] ?? NO_DECISION;
  const decide = (id: string, patch: Partial<Decision>) => {
    setDecisions((current) => ({
      ...current,
      [id]: { ...(current[id] ?? NO_DECISION), ...patch },
    }));
  };

  const sorted = useMemo(
    () => [...(pending.data ?? [])].sort(byQueue(coverageById)),
    [pending.data, coverageById],
  );
  const sellers = useMemo(
    () =>
      [...new Map(sorted.map((order) => [order.seller.id, order.seller.name])).entries()].sort(
        ([, a], [, b]) => a.localeCompare(b),
      ),
    [sorted],
  );
  const matching = useMemo(() => {
    const query = normalizeText(search.trim());
    return sorted.filter(
      (order) =>
        (!sellerId || order.seller.id === sellerId) &&
        (!query ||
          normalizeText(
            [
              order.label,
              order.customer.name,
              order.customer.documentNumber,
              order.branch.name,
              order.seller.name,
            ].join(' '),
          ).includes(query)),
    );
  }, [sorted, search, sellerId]);
  const rows = useMemo(
    () =>
      filter === 'all'
        ? matching
        : matching.filter((order) => coverageById.get(order.id)?.status === filter),
    [matching, filter, coverageById],
  );
  const countOf = (status: CoverageStatus) =>
    matching.filter((order) => coverageById.get(order.id)?.status === status).length;

  const chosen = sorted.filter((order) => selected.has(order.id));
  const chosenWithPending = chosen.filter((order) => {
    const row = coverageById.get(order.id);
    return row !== undefined && row.status !== 'COVERED';
  });
  const invalidPriority = chosen.some(
    (order) => parsePriority(decisionOf(order.id).priority) === 'invalid',
  );
  const chosenTotal = sumPesos(chosen.map((order) => values.get(order.id)?.total ?? 0n));

  const issue = useAction(
    (body: { orders: { orderId: string; allowPartial: boolean; priority?: number }[] }) =>
      api.post<Invoice[]>('/v1/invoices', body),
    {
      success: (result) =>
        result.length === 1
          ? `Factura ${result[0]?.label ?? ''} emitida`
          : `${String(result.length)} facturas emitidas`,
    },
  );
  const submit = () => {
    const payload = chosen.map((order) => {
      const decision = decisionOf(order.id);
      const priority = parsePriority(decision.priority);
      return {
        orderId: order.id,
        allowPartial: decision.allowPartial,
        ...(typeof priority === 'number' ? { priority } : {}),
      };
    });
    issue.mutate(
      { orders: payload },
      {
        onSuccess: (result) => {
          setIssued(result);
          setSelected(new Set());
          setConfirming(false);
        },
      },
    );
  };
  const start = () => {
    if (chosen.length === 0 || invalidPriority) return;
    if (chosenWithPending.length > 0) setConfirming(true);
    else submit();
  };

  const columns: QueryColumn<SalesOrder>[] = [
    {
      key: 'turn',
      header: 'Turno',
      align: 'right',
      className: 'text-ink-3',
      render: (order) => coverageById.get(order.id)?.priority ?? '—',
      sort: (order) => coverageById.get(order.id)?.priority ?? Number.MAX_SAFE_INTEGER,
      csv: (order) => coverageById.get(order.id)?.priority ?? '',
    },
    {
      key: 'order',
      header: 'Pedido',
      render: (order) => (
        <EntityLink to="order" id={order.id} className="font-medium">
          {order.label}
        </EntityLink>
      ),
      sort: (order) => Number(order.number),
      csv: (order) => order.label,
    },
    {
      key: 'sent',
      optional: true,
      header: 'Enviado',
      hideOnMobile: true,
      render: (order) => (
        <span className="whitespace-nowrap">
          {order.confirmedAt ? formatDate(colombiaDay(order.confirmedAt)) : '—'}
        </span>
      ),
      sort: (order) => order.confirmedAt ?? '',
      csv: (order) => (order.confirmedAt ? colombiaDay(order.confirmedAt) : ''),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (order) => (
        <EntityLink to="customer" id={order.customer.id}>
          {order.customer.name}
        </EntityLink>
      ),
      sort: (order) => order.customer.name,
      csv: (order) => order.customer.name,
    },
    {
      key: 'branch',
      header: 'Sucursal',
      hideOnMobile: true,
      render: (order) => order.branch.name,
      csv: (order) => order.branch.name,
    },
    {
      key: 'seller',
      optional: true,
      header: 'Vendedor',
      hideOnMobile: true,
      render: (order) => order.seller.name,
      sort: (order) => order.seller.name,
      csv: (order) => order.seller.name,
    },
    {
      key: 'promised',
      header: 'Fecha prometida',
      render: (order) => (
        <span className="text-[13px]">
          <DueDate date={order.estimatedDeliveryDate} lateLabel="Atrasado" />
        </span>
      ),
      sort: (order) => order.estimatedDeliveryDate ?? '9999-12-31',
      csv: (order) => order.estimatedDeliveryDate ?? '',
    },
    {
      key: 'units',
      header: 'Unidades',
      align: 'right',
      render: (order) => formatUnits(splitOf(order, coverageById.get(order.id)).quantity),
      sort: (order) => splitOf(order, coverageById.get(order.id)).quantity,
      csv: (order) => formatUnits(splitOf(order, coverageById.get(order.id)).quantity),
      total: (list) =>
        formatUnits(list.reduce((sum, order) => sum + splitOf(order, undefined).quantity, 0)),
    },
    {
      key: 'stock',
      header: 'Del stock',
      align: 'right',
      render: (order) => formatUnits(splitOf(order, coverageById.get(order.id)).stock),
      csv: (order) => formatUnits(splitOf(order, coverageById.get(order.id)).stock),
      total: (list) =>
        formatUnits(
          list.reduce((sum, order) => sum + splitOf(order, coverageById.get(order.id)).stock, 0),
        ),
    },
    {
      key: 'production',
      header: 'Por fabricar',
      align: 'right',
      render: (order) => {
        const value = splitOf(order, coverageById.get(order.id)).production;
        return (
          <span className={value > 0 ? 'font-medium' : 'text-ink-3'}>{formatUnits(value)}</span>
        );
      },
      csv: (order) => formatUnits(splitOf(order, coverageById.get(order.id)).production),
      total: (list) =>
        formatUnits(
          list.reduce(
            (sum, order) => sum + splitOf(order, coverageById.get(order.id)).production,
            0,
          ),
        ),
    },
    {
      key: 'buy',
      header: 'Por comprar',
      align: 'right',
      render: (order) => {
        const value = splitOf(order, coverageById.get(order.id)).uncovered;
        return (
          <span className={value > 0 ? 'font-medium text-critical' : 'text-ink-3'}>
            {formatUnits(value)}
          </span>
        );
      },
      csv: (order) => formatUnits(splitOf(order, coverageById.get(order.id)).uncovered),
      total: (list) =>
        formatUnits(
          list.reduce(
            (sum, order) => sum + splitOf(order, coverageById.get(order.id)).uncovered,
            0,
          ),
        ),
    },
    {
      key: 'coverage',
      header: 'Cobertura',
      render: (order) => {
        const row = coverageById.get(order.id);
        return row ? <CoverageChip status={row.status} /> : <span className="text-ink-3">—</span>;
      },
      sort: (order) => coverageById.get(order.id)?.status ?? '',
      csv: (order) => {
        const row = coverageById.get(order.id);
        return row ? COVERAGE[row.status].label : '';
      },
    },
    {
      key: 'value',
      header: 'Valor con IVA',
      align: 'right',
      render: (order) => {
        const value = values.get(order.id);
        if (!value) return '—';
        return value.missing.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-[12.5px] text-critical"
            title="Sin precio de lista: no se puede facturar hasta que lo tenga"
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            Sin precio: {value.missing.join(', ')}
          </span>
        ) : (
          <Money value={value.total} />
        );
      },
      sort: (order) => Number(values.get(order.id)?.total ?? 0n),
      csv: (order) => (values.get(order.id)?.total ?? 0n).toString(),
      total: (list) => (
        <Money value={sumPesos(list.map((order) => values.get(order.id)?.total ?? 0n))} />
      ),
    },
    ...(canIssue
      ? ([
          {
            key: 'priority',
            header: 'Prioridad',
            align: 'center',
            render: (order) => {
              const decision = decisionOf(order.id);
              const invalid = parsePriority(decision.priority) === 'invalid';
              return (
                <span
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <input
                    aria-label={`Prioridad de ${order.label}`}
                    title="1 se lleva primero el stock; vacío, por fecha prometida"
                    inputMode="numeric"
                    value={decision.priority}
                    placeholder="—"
                    aria-invalid={invalid ? true : undefined}
                    onChange={(event) => {
                      decide(order.id, {
                        priority: event.target.value.replace(/\s/g, '').slice(0, 4),
                      });
                    }}
                    className={cn(
                      FILTER_INPUT,
                      'h-7 w-14 text-center tabular-nums',
                      invalid && 'border-critical',
                    )}
                  />
                </span>
              );
            },
          },
          {
            key: 'partial',
            header: 'Parcial',
            align: 'center',
            render: (order) => (
              <span
                onDoubleClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Permitir despacho parcial de ${order.label}`}
                  title="Planta puede entregar ya lo que hay en stock y el resto después"
                  checked={decisionOf(order.id).allowPartial}
                  onChange={(event) => {
                    decide(order.id, { allowPartial: event.target.checked });
                  }}
                  className="size-4 accent-[var(--color-brand)]"
                />
              </span>
            ),
          },
        ] satisfies QueryColumn<SalesOrder>[])
      : []),
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label:
              chosen.length > 0
                ? `Facturar seleccionados (${String(chosen.length)})`
                : 'Facturar seleccionados',
            icon: ReceiptText,
            shortcut: 'F9',
            primary: true,
            hidden: !canIssue,
            disabled: chosen.length === 0 || invalidPriority,
            loading: issue.isPending,
            title: invalidPriority
              ? 'Revisa la prioridad: un número de 1 a 9999 o vacío'
              : 'Emite una factura por cada pedido seleccionado',
            onClick: start,
          },
        ]}
      />
      <ScreenTitle
        title="Facturación de pedidos"
        description={
          canIssue
            ? 'Marca los pedidos a facturar, su prioridad (1 se lleva primero el stock) y si permiten despacho parcial. Se facturan siempre: lo que el stock no cubre queda pendiente por fabricar o comprar.'
            : 'Pedidos enviados por los vendedores, en el orden en que tomarían el stock.'
        }
      />
      {issued.length > 0 ? (
        <IssuedNotice
          invoices={issued}
          onDismiss={() => {
            setIssued([]);
          }}
        />
      ) : null}

      <FilterBar>
        <FilterField label="Buscar">
          <input
            value={search}
            placeholder="Pedido, cliente, NIT o sucursal"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            className={`${FILTER_INPUT} w-64`}
          />
        </FilterField>
        <FilterField label="Vendedor">
          <select
            value={sellerId}
            onChange={(event) => {
              setSellerId(event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todos</option>
            {sellers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Cobertura">
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as CoverageFilter);
            }}
            className={FILTER_INPUT}
          >
            <option value="all">Todas ({matching.length})</option>
            <option value="COVERED">Cubierto con stock ({countOf('COVERED')})</option>
            <option value="NEEDS_PRODUCTION">
              Requiere producción ({countOf('NEEDS_PRODUCTION')})
            </option>
            <option value="SHORT">Falta comprar ({countOf('SHORT')})</option>
          </select>
        </FilterField>
      </FilterBar>

      <GridTitle aside="Enter o doble clic abre el pedido · Espacio marca la fila">
        Pedidos por facturar
      </GridTitle>
      <QueryView query={pending}>
        {() => (
          <QueryGrid
            title="Pedidos por facturar"
            exportName="pedidos-por-facturar"
            columns={columns}
            rows={rows}
            rowKey={(order) => order.id}
            selectable={canIssue}
            selected={selected}
            onSelectedChange={setSelected}
            isSelectable={(order) => (values.get(order.id)?.missing.length ?? 0) === 0}
            onOpen={(order) => {
              void navigate(`/ventas/${order.id}`);
            }}
            rowClassName={(order) =>
              parsePriority(decisionOf(order.id).priority) === 'invalid'
                ? 'bg-critical-soft/40'
                : undefined
            }
            actions={
              chosen.length > 0 ? (
                <span className="text-[13px] text-ink-2 tabular-nums">
                  Valor seleccionado{' '}
                  <span className="font-semibold text-ink">
                    {formatCop(chosenTotal.toString())}
                  </span>
                  {chosenWithPending.length > 0
                    ? ` · ${plural(chosenWithPending.length, 'con pendiente', 'con pendiente')}`
                    : ''}
                </span>
              ) : null
            }
            empty="No hay pedidos por facturar. Cuando un vendedor envíe un pedido, aparece aquí con su cobertura de stock."
          />
        )}
      </QueryView>

      <GridTitle aside="Sin prioridad, el pedido va por fecha prometida">
        Facturados pendientes de despacho
      </GridTitle>
      <QueryView query={invoiced}>
        {(orders) => <DispatchQueue orders={orders} coverage={coverageById} canIssue={canIssue} />}
      </QueryView>

      <PendingConfirmation
        open={confirming}
        chosen={chosen}
        withPending={chosenWithPending}
        coverage={coverageById}
        decisions={decisions}
        loading={issue.isPending}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={submit}
      />
    </>
  );
}

function IssuedNotice({ invoices, onDismiss }: { invoices: Invoice[]; onDismiss: () => void }) {
  const total = sumPesos(invoices.map((invoice) => invoice.total));
  const withPending = invoices.filter((invoice) => invoice.hasPending).length;
  return (
    <div
      role="status"
      className="mb-3 flex items-start gap-2.5 rounded-md border border-good/30 bg-good-soft px-3 py-2 text-[13.5px]"
    >
      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={2.25} />
      <p className="min-w-0 flex-1">
        <span className="font-medium">
          {invoices.length === 1
            ? 'Se emitió 1 factura'
            : `Se emitieron ${String(invoices.length)} facturas`}{' '}
          por {formatCop(total.toString())}:
        </span>{' '}
        {invoices.map((invoice, index) => (
          <span key={invoice.id}>
            {index > 0 ? ', ' : ''}
            <EntityLink to="invoice" id={invoice.id} className="font-medium">
              {invoice.label}
            </EntityLink>{' '}
            ({invoice.customer.name})
          </span>
        ))}
        .
        {withPending > 0
          ? ` ${plural(withPending, 'quedó', 'quedaron')} con producto pendiente: planta y compras ya lo tienen en su lista.`
          : ''}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="rounded p-0.5 text-ink-3 hover:bg-surface hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

interface PendingRow {
  key: string;
  order: SalesOrder;
  product: string;
  production: OrderCoverage['lines'][number]['fromProduction'];
  uncovered: OrderCoverage['lines'][number]['uncovered'];
  partial: boolean;
}

/** "Facturar con pendiente": explains what happens before invoicing (double confirmation). */
function PendingConfirmation({
  open,
  chosen,
  withPending,
  coverage,
  decisions,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  chosen: SalesOrder[];
  withPending: SalesOrder[];
  coverage: ReadonlyMap<string, OrderCoverage>;
  decisions: Record<string, Decision | undefined>;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const rows: PendingRow[] = withPending.flatMap((order) =>
    (coverage.get(order.id)?.lines ?? [])
      .filter((line) => line.status !== 'COVERED')
      .map((line) => ({
        key: `${order.id}-${line.product.id}`,
        order,
        product: `${line.product.code} · ${line.product.name}`,
        production: line.fromProduction,
        uncovered: line.uncovered,
        partial: decisions[order.id]?.allowPartial ?? false,
      })),
  );
  const columns: DocColumn<PendingRow>[] = [
    { key: 'order', header: 'Pedido', className: 'font-medium', render: (row) => row.order.label },
    { key: 'customer', header: 'Cliente', render: (row) => row.order.customer.name },
    { key: 'product', header: 'Producto', render: (row) => row.product },
    {
      key: 'make',
      header: 'Por fabricar',
      align: 'right',
      render: (row) =>
        isZero(row.production.quantity) ? '—' : formatUnits(Number(row.production.quantity)),
    },
    {
      key: 'buy',
      header: 'Por comprar',
      align: 'right',
      render: (row) =>
        isZero(row.uncovered.quantity) ? '—' : formatUnits(Number(row.uncovered.quantity)),
    },
    {
      key: 'partial',
      header: 'Despacho',
      render: (row) => (row.partial ? 'Parcial: sale lo que hay' : 'Completo'),
    },
  ];
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Facturar con producto pendiente"
      description={`${plural(withPending.length, 'pedido tiene', 'pedidos tienen')} producto que el stock no cubre hoy.`}
      confirmLabel={`Sí, facturar ${plural(chosen.length, 'pedido', 'pedidos')}`}
      loading={loading}
      onConfirm={onConfirm}
    >
      <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-[13.5px]">
        <strong className="font-semibold">Se facturan igual.</strong> Lo que el stock no cubre queda{' '}
        <strong className="font-semibold">pendiente por fabricar o comprar</strong>: planta lo ve en
        sus órdenes de producción, compras en lo que hay que comprar, y la auditoría deja registrado
        que la factura salió con pendiente. Sin despacho parcial, el pedido sale completo cuando
        todo esté listo.
      </p>
      <div className="-mx-5">
        <DocTable
          label="Producto pendiente"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
        />
      </div>
    </ConfirmDialog>
  );
}

// --- invoiced, waiting for dispatch -------------------------------------------------------------

function DispatchQueue({
  orders,
  coverage,
  canIssue,
}: {
  orders: SalesOrder[];
  coverage: ReadonlyMap<string, OrderCoverage>;
  canIssue: boolean;
}) {
  const navigate = useNavigate();
  const sorted = useMemo(() => [...orders].sort(byQueue(coverage)), [orders, coverage]);
  const turn = useMemo(
    () => new Map(sorted.map((order, index) => [order.id, index + 1])),
    [sorted],
  );
  const reorder = useAction(
    (change: { id: string; priority: number | null }) =>
      api.patch(`/v1/sales-orders/${change.id}/priority`, { priority: change.priority }),
    { success: 'Prioridad actualizada: el stock se reparte en el nuevo orden' },
  );

  const columns: QueryColumn<SalesOrder>[] = [
    {
      key: 'turn',
      header: 'Turno',
      align: 'right',
      className: 'text-ink-3',
      render: (order) => turn.get(order.id) ?? '—',
      sort: (order) => turn.get(order.id) ?? 0,
      csv: (order) => turn.get(order.id) ?? '',
    },
    {
      key: 'order',
      header: 'Pedido',
      render: (order) => (
        <EntityLink to="order" id={order.id} className="font-medium">
          {order.label}
        </EntityLink>
      ),
      sort: (order) => Number(order.number),
      csv: (order) => order.label,
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (order) => order.customer.name,
      sort: (order) => order.customer.name,
      csv: (order) => order.customer.name,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (order) => <OrderStatusChip status={order.status} />,
      csv: (order) => order.statusLabel,
    },
    {
      key: 'coverage',
      header: 'Stock hoy',
      render: (order) => {
        const row = coverage.get(order.id);
        return row ? <CoverageChip status={row.status} /> : <span className="text-ink-3">—</span>;
      },
      csv: (order) => {
        const row = coverage.get(order.id);
        return row ? COVERAGE[row.status].label : '';
      },
    },
    {
      key: 'promised',
      header: 'Fecha prometida',
      render: (order) => (
        <span className="text-[13px]">
          <DueDate date={order.estimatedDeliveryDate} lateLabel="Atrasado" />
        </span>
      ),
      sort: (order) => order.estimatedDeliveryDate ?? '9999-12-31',
      csv: (order) => order.estimatedDeliveryDate ?? '',
    },
    {
      key: 'partial',
      header: 'Parcial',
      align: 'center',
      render: (order) => (order.allowPartial ? 'Sí' : 'No'),
      csv: (order) => (order.allowPartial ? 'Sí' : 'No'),
    },
    {
      key: 'invoiced',
      header: 'Facturado',
      hideOnMobile: true,
      render: (order) => (
        <span className="whitespace-nowrap">
          {order.invoicedAt ? formatDate(colombiaDay(order.invoicedAt)) : '—'}
        </span>
      ),
      sort: (order) => order.invoicedAt ?? '',
      csv: (order) => (order.invoicedAt ? colombiaDay(order.invoicedAt) : ''),
    },
    {
      key: 'priority',
      header: 'Prioridad',
      align: 'center',
      render: (order) =>
        canIssue ? (
          <span
            onDoubleClick={(event) => {
              event.stopPropagation();
            }}
          >
            <PriorityInput
              value={order.priority}
              label={`Prioridad de ${order.label}`}
              disabled={reorder.isPending}
              onCommit={(priority) => {
                reorder.mutate({ id: order.id, priority });
              }}
            />
          </span>
        ) : order.priority === null ? (
          <span className="text-ink-3">Por fecha</span>
        ) : (
          <span className="font-semibold tabular-nums">{order.priority}</span>
        ),
      sort: (order) => order.priority ?? Number.MAX_SAFE_INTEGER,
      csv: (order) => order.priority ?? '',
    },
  ];

  return (
    <QueryGrid
      title="Facturados pendientes de despacho"
      exportName="facturados-por-despachar"
      columns={columns}
      rows={sorted}
      rowKey={(order) => order.id}
      onOpen={(order) => {
        void navigate(`/ventas/${order.id}`);
      }}
      empty="No hay pedidos facturados esperando despacho."
    />
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
    <input
      aria-label={label}
      title="1 se lleva primero el stock; vacío, por fecha prometida. Enter guarda."
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
        if (event.key === 'Escape') {
          event.stopPropagation();
          setText(shown);
        }
      }}
      className={cn(
        FILTER_INPUT,
        'h-7 w-14 text-center tabular-nums',
        parsed === 'invalid' && 'border-critical',
      )}
    />
  );
}
