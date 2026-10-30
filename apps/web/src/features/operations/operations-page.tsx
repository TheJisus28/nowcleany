import { ArrowDown, ArrowUp, RefreshCw, Settings2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useFinance,
  useOrders,
  useOversell,
  useProductionNeeds,
  useProductionOrders,
  useProducts,
  usePurchaseNeeds,
  usePurchaseOrders,
  useStockStatus,
  useSupplierInvoices,
  useTrail,
} from '../../api/hooks';
import type { OrderStatus, SalesOrder } from '../../api/types';
import { useProfile } from '../../auth/session';
import { DocumentToolbar } from '../../components/erp/toolbar';
import { PrintHeader } from '../../components/erp/print';
import { cn } from '../../components/ui';
import { daysUntil, formatCop, formatDateTime, formatDecimal, todayIso } from '../../lib/format';

/** Blocks of the management board; each manager chooses which to see and in what order. */
const BLOCKS = [
  { key: 'flow', label: 'Flujo de pedidos por actor' },
  { key: 'purchasing', label: 'Compras y recepción' },
  { key: 'production', label: 'Producción' },
  { key: 'money', label: 'Cartera y pagos' },
  { key: 'stock', label: 'Inventario' },
  { key: 'activity', label: 'Actividad reciente (auditoría)' },
] as const;
type BlockKey = (typeof BLOCKS)[number]['key'];

interface BoardPrefs {
  order: BlockKey[];
  hidden: BlockKey[];
}

function usePrefs(userId: string): [BoardPrefs, (prefs: BoardPrefs) => void] {
  const key = `scip.board.${userId}`;
  const [prefs, setPrefs] = useState<BoardPrefs>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as BoardPrefs | null;
      const keys = BLOCKS.map((block) => block.key);
      if (stored)
        return {
          order: [
            ...stored.order.filter((k) => keys.includes(k)),
            ...keys.filter((k) => !stored.order.includes(k)),
          ],
          hidden: stored.hidden.filter((k) => keys.includes(k)),
        };
    } catch {
      // Defaults below.
    }
    return { order: BLOCKS.map((block) => block.key), hidden: [] };
  });
  return [
    prefs,
    (next) => {
      setPrefs(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode.
      }
    },
  ];
}

/** A block of the board: a heading with its detail link and a compact table. */
function Block({
  title,
  detail,
  children,
  wide = false,
}: {
  title: string;
  detail?: { to: string; label: string } | undefined;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={cn(
        'rounded-[8px] border border-line bg-surface break-inside-avoid',
        wide && 'xl:col-span-2',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[14px] font-semibold [font-stretch:108%]">{title}</h2>
        {detail ? (
          <Link to={detail.to} className="no-print text-[12.5px] text-brand hover:underline">
            {detail.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
}: {
  head: readonly { label: string; align?: 'right' }[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <table className="w-full text-[13.5px]">
      <thead>
        <tr className="border-b border-line bg-surface-2/70 text-left text-[12px] text-ink-2">
          {head.map((cell) => (
            <th
              key={cell.label}
              className={cn('px-4 py-1.5 font-medium', cell.align === 'right' && 'text-right')}
            >
              {cell.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-line last:border-0">
            {row.map((cell, column) => (
              <td
                key={column}
                className={cn(
                  'px-4 py-1.5',
                  head[column]?.align === 'right' && 'text-right tabular-nums',
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const n = (value: number) => value.toLocaleString('es-CO');
const late = (value: number) =>
  value > 0 ? (
    <span className="font-medium text-critical">{n(value)}</span>
  ) : (
    <span className="text-ink-3">0</span>
  );

/** Stages of the order flow and who must act in each. */
const STAGES: readonly { status: OrderStatus; label: string; actor: string; to: string }[] = [
  {
    status: 'DRAFT',
    label: 'Preventas en borrador',
    actor: 'Vendedores',
    to: '/ventas?estado=DRAFT',
  },
  {
    status: 'CONFIRMED',
    label: 'Por facturar',
    actor: 'Facturación (Diego)',
    to: '/consolidado',
  },
  { status: 'INVOICED', label: 'Facturados por alistar', actor: 'Planta', to: '/planta' },
  { status: 'PARTIAL', label: 'Despachados parcialmente', actor: 'Planta', to: '/planta' },
  { status: 'READY', label: 'Alistados por despachar', actor: 'Logística', to: '/logistica' },
  { status: 'DISPATCHED', label: 'En ruta', actor: 'Logística', to: '/logistica' },
];

function FlowBlock() {
  const open = useOrders({
    status: 'DRAFT,CONFIRMED,INVOICED,READY,PARTIAL,DISPATCHED',
    limit: '2000',
  });
  const delivered = useOrders({ status: 'DELIVERED', limit: '2000' });
  const products = useProducts({ active: true });
  const price = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product.price])),
    [products.data],
  );
  const value = (orders: readonly SalesOrder[]) =>
    orders
      .flatMap((order) => order.lines)
      .reduce((sum, line) => {
        const unit = price.get(line.productId);
        return unit ? sum + Number(line.pending.quantity) * Number(unit) : sum;
      }, 0);
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const deliveredThisMonth = (delivered.data ?? []).filter(
    (order) => (order.deliveredAt ?? '').slice(0, 10) >= monthStart,
  );
  const rows = STAGES.map((stage) => {
    const orders = (open.data ?? []).filter((order) => order.status === stage.status);
    const oldest = orders.reduce<number | null>((max, order) => {
      const age = -(daysUntil(order.confirmedAt ?? order.createdAt) ?? 0);
      return max === null || age > max ? age : max;
    }, null);
    const overdue = orders.filter(
      (order) => order.estimatedDeliveryDate !== null && order.estimatedDeliveryDate < today,
    ).length;
    return [
      <Link key="l" to={stage.to} className="text-ink hover:text-brand hover:underline">
        {stage.label}
      </Link>,
      stage.actor,
      n(orders.length),
      formatCop(String(Math.round(value(orders)))),
      oldest === null ? '—' : `${String(oldest)} d`,
      late(overdue),
    ];
  });
  return (
    <Block
      title="Flujo de pedidos por actor"
      detail={{ to: '/ventas', label: 'Consulta de pedidos' }}
      wide
    >
      <Table
        head={[
          { label: 'Paso' },
          { label: 'Responsable' },
          { label: 'Pedidos', align: 'right' },
          { label: 'Valor pendiente', align: 'right' },
          { label: 'Más antiguo', align: 'right' },
          { label: 'Fecha prometida vencida', align: 'right' },
        ]}
        rows={[
          ...rows,
          [
            <span key="d" className="text-ink-2">
              Entregados este mes
            </span>,
            'Logística',
            n(deliveredThisMonth.length),
            '',
            '',
            '',
          ],
        ]}
      />
    </Block>
  );
}

function PurchasingBlock() {
  const orders = usePurchaseOrders('OPEN,PARTIAL');
  const needs = usePurchaseNeeds();
  const entries = useSupplierInvoices();
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const open = orders.data ?? [];
  const urgent = (needs.data?.rows ?? []).filter((row) => Number(row.toBuy.quantity) > 0);
  const thisMonth = (entries.data ?? []).filter((invoice) => invoice.invoiceDate >= monthStart);
  const sum = (values: readonly string[]) =>
    values.reduce((total, value) => total + Number(value), 0);
  return (
    <Block title="Compras y recepción" detail={{ to: '/compras', label: 'Órdenes de compra' }}>
      <Table
        head={[
          { label: 'Concepto' },
          { label: 'Responsable' },
          { label: 'Cantidad', align: 'right' },
          { label: 'Valor', align: 'right' },
        ]}
        rows={[
          ['Compra urgente (falta para lo vendido)', 'Compras (Alfonso)', late(urgent.length), ''],
          [
            'Órdenes en tránsito',
            'Proveedores',
            n(open.filter((order) => order.status === 'OPEN').length),
            formatCop(String(sum(open.filter((o) => o.status === 'OPEN').map((o) => o.total)))),
          ],
          [
            'Órdenes recibidas parcialmente',
            'Recepción (Silvia)',
            n(open.filter((order) => order.status === 'PARTIAL').length),
            '',
          ],
          [
            'Órdenes con llegada vencida',
            'Compras (Alfonso)',
            late(
              open.filter((order) => order.expectedDate !== null && order.expectedDate < today)
                .length,
            ),
            '',
          ],
          [
            'Entradas de almacén este mes',
            'Recepción (Silvia)',
            n(thisMonth.length),
            formatCop(String(sum(thisMonth.map((invoice) => invoice.total)))),
          ],
        ]}
      />
    </Block>
  );
}

function ProductionBlock() {
  const planned = useProductionOrders('PLANNED');
  const needs = useProductionNeeds();
  const today = todayIso();
  const rows = planned.data ?? [];
  return (
    <Block title="Producción" detail={{ to: '/planta/produccion', label: 'Órdenes de producción' }}>
      <Table
        head={[{ label: 'Concepto' }, { label: 'Cantidad', align: 'right' }]}
        rows={[
          ['Órdenes programadas', n(rows.length)],
          [
            'Órdenes atrasadas',
            late(
              rows.filter((order) => order.scheduledDate !== null && order.scheduledDate < today)
                .length,
            ),
          ],
          [
            'Terminados por envasar (para pedidos)',
            n(
              (needs.data?.packaging ?? []).filter((row) => Number(row.toPack.quantity) > 0).length,
            ),
          ],
          [
            'Graneles por fabricar',
            n((needs.data?.bulk ?? []).filter((row) => Number(row.toProduce.quantity) > 0).length),
          ],
        ]}
      />
    </Block>
  );
}

function MoneyBlock() {
  const finance = useFinance();
  const data = finance.data;
  return (
    <Block
      title="Cartera y pagos"
      detail={{ to: '/contabilidad', label: 'Informe de cobros y pagos' }}
    >
      <Table
        head={[{ label: 'Concepto' }, { label: 'Valor', align: 'right' }]}
        rows={
          data
            ? [
                ['Cartera por cobrar', formatCop(data.receivables.total)],
                [
                  <span key="o">Cartera vencida</span>,
                  <span
                    key="v"
                    className={
                      Number(data.receivables.overdue) > 0 ? 'font-medium text-critical' : ''
                    }
                  >
                    {formatCop(data.receivables.overdue)}
                  </span>,
                ],
                ['Cuentas por pagar a proveedores', formatCop(data.payables.total)],
                ['Por pagar vencido', formatCop(data.payables.overdue)],
                ['Cobrado este mes', formatCop(data.totals.collected)],
                ['Pagado este mes', formatCop(data.totals.paid)],
              ]
            : [['Cargando…', '']]
        }
      />
    </Block>
  );
}

function StockBlock() {
  const finished = useStockStatus({ type: 'FINISHED_GOOD' });
  const raw = useStockStatus({ type: 'RAW_MATERIAL' });
  const oversell = useOversell();
  const uncovered = (oversell.data?.rows ?? []).filter((row) => Number(row.uncovered.quantity) > 0);
  return (
    <Block title="Inventario" detail={{ to: '/inventario', label: 'Existencias' }}>
      <Table
        head={[{ label: 'Concepto' }, { label: 'Productos', align: 'right' }]}
        rows={[
          [
            'Terminados vendidos por encima del físico',
            late((finished.data ?? []).filter((row) => row.oversold).length),
          ],
          [
            'Materias primas con físico negativo',
            late((raw.data ?? []).filter((row) => row.negativeOnHand).length),
          ],
          [
            <Link key="s" to="/informes/sobreventa" className="hover:text-brand hover:underline">
              Productos vendidos más allá de lo que se puede fabricar
            </Link>,
            late(uncovered.length),
          ],
        ]}
      />
    </Block>
  );
}

function ActivityBlock() {
  const trail = useTrail({ from: todayIso().slice(0, 8) + '01' });
  return (
    <Block
      title="Actividad reciente (auditoría)"
      detail={{ to: '/traza', label: 'Auditoría completa' }}
      wide
    >
      <Table
        head={[
          { label: 'Fecha y hora' },
          { label: 'Documento' },
          { label: 'Quién' },
          { label: 'Qué hizo' },
        ]}
        rows={(trail.data ?? []).slice(0, 12).map((entry) => [
          <span key="t" className="whitespace-nowrap text-ink-2 tabular-nums">
            {formatDateTime(entry.occurredAt)}
          </span>,
          <span key="d" className="whitespace-nowrap">
            {entry.label}
          </span>,
          <span key="a" className="whitespace-nowrap">
            {entry.actor.name}
            {entry.actor.role ? <span className="text-ink-3"> ({entry.actor.role})</span> : null}
          </span>,
          <span key="s" className="text-ink-2">
            {entry.summary}
          </span>,
        ])}
      />
    </Block>
  );
}

const RENDER: Record<BlockKey, () => ReactNode> = {
  flow: () => <FlowBlock />,
  purchasing: () => <PurchasingBlock />,
  production: () => <ProductionBlock />,
  money: () => <MoneyBlock />,
  stock: () => <StockBlock />,
  activity: () => <ActivityBlock />,
};

/** The whole operation at a glance: every actor and what is waiting in each step of the flow. */
export function OperationsPage() {
  const profile = useProfile();
  const client = useQueryClient();
  const [prefs, setPrefs] = usePrefs(profile.id);
  const [configuring, setConfiguring] = useState(false);
  const shown = prefs.order.filter((key) => !prefs.hidden.includes(key));
  const move = (index: number, delta: number) => {
    const order = [...prefs.order];
    const [item] = order.splice(index, 1);
    if (!item) return;
    order.splice(index + delta, 0, item);
    setPrefs({ ...prefs, order });
  };

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Actualizar',
            icon: RefreshCw,
            shortcut: 'F5',
            onClick: () => {
              void client.invalidateQueries();
            },
          },
          {
            label: 'Configurar tablero',
            icon: Settings2,
            onClick: () => {
              setConfiguring((value) => !value);
            },
          },
          {
            label: 'Imprimir',
            shortcut: 'Ctrl+P',
            onClick: () => {
              window.print();
            },
          },
        ]}
      />
      <PrintHeader
        title="Tablero de operación"
        subtitle={`Corte: ${formatDateTime(new Date().toISOString())}`}
      />
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[22px] font-semibold [font-stretch:110%]">Tablero de operación</h1>
        <p className="text-[13px] text-ink-3">
          Corte {formatDateTime(new Date().toISOString())} · {formatDecimal(String(shown.length))}{' '}
          bloques
        </p>
      </div>

      {configuring ? (
        <section className="no-print mb-4 rounded-[8px] border border-line bg-surface p-3">
          <ul className="grid gap-1 sm:grid-cols-2">
            {prefs.order.map((key, index) => {
              const block = BLOCKS.find((item) => item.key === key);
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-2"
                >
                  <label className="flex flex-1 items-center gap-2 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={!prefs.hidden.includes(key)}
                      onChange={() => {
                        setPrefs({
                          ...prefs,
                          hidden: prefs.hidden.includes(key)
                            ? prefs.hidden.filter((item) => item !== key)
                            : [...prefs.hidden, key],
                        });
                      }}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    {block?.label}
                  </label>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      move(index, -1);
                    }}
                    className="rounded p-1 text-ink-3 hover:text-ink disabled:opacity-30"
                    aria-label={`Subir ${block?.label ?? ''}`}
                  >
                    <ArrowUp aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === prefs.order.length - 1}
                    onClick={() => {
                      move(index, 1);
                    }}
                    className="rounded p-1 text-ink-3 hover:text-ink disabled:opacity-30"
                    aria-label={`Bajar ${block?.label ?? ''}`}
                  >
                    <ArrowDown aria-hidden className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {shown.map((key) => (
          <div
            key={key}
            className={key === 'flow' || key === 'activity' ? 'xl:col-span-2' : undefined}
          >
            {RENDER[key]()}
          </div>
        ))}
      </div>
    </>
  );
}
