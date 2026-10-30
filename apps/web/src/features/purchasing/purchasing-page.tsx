import { CalendarRange, FilePlus2, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProducts, usePurchaseNeeds, usePurchaseOrders, useSuppliers } from '../../api/hooks';
import type { PurchaseNeed, PurchaseOrder } from '../../api/types';
import { useAccess } from '../../app/access';
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
import { Qty } from '../../components/qty';
import { PurchaseStatusChip } from '../../components/status';
import { Button, QueryView } from '../../components/ui';
import { formatCop, formatDate, isZero, roundUpDecimal } from '../../lib/format';
import {
  csvQty,
  DateCell,
  inRange,
  INPUT,
  localDay,
  QueryPanel,
  ScreenTitle,
  SELECT,
  useUrlFilters,
} from '../inventory/erp-kit';
import { amountOf, pendingValue, vatOf } from './money';

const FILTERS = { estado: 'OPEN,PARTIAL', proveedor: '', desde: '', hasta: '', q: '' };

const isOpen = (order: PurchaseOrder) => order.status === 'OPEN' || order.status === 'PARTIAL';
const sumCop = <T,>(rows: readonly T[], pick: (row: T) => bigint | string) =>
  formatCop(rows.reduce((sum, row) => sum + BigInt(pick(row)), 0n).toString());

/** "/compras/nueva?productos=id:cantidad:costo,…" for lines chosen in a consultation. */
export function newOrderPath(
  lines: readonly { productId: string; quantity: string; unitCost?: string | null }[],
) {
  if (lines.length === 0) return '/compras/nueva';
  const encoded = lines
    .map((line) => [line.productId, line.quantity, line.unitCost ?? ''].join(':'))
    .join(',');
  return `/compras/nueva?productos=${encoded}`;
}

/**
 * Purchasing's consultations: purchase orders by status, supplier and date, and the urgent purchase
 * (what is missing for orders already sold) to select and turn into a purchase order with F9.
 */
export function PurchasingPage() {
  useWorkTab('Órdenes de compra');
  const navigate = useNavigate();
  const { can } = useSession();
  const { has } = useAccess();
  const canWrite = can('purchasing:write');
  const filters = useUrlFilters(FILTERS);
  const { estado, proveedor, desde, hasta, q } = filters.applied;
  const orders = usePurchaseOrders(estado || undefined);
  const suppliers = useSuppliers();
  const needs = usePurchaseNeeds();
  const products = useProducts({ active: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const costs = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product.cost])),
    [products.data],
  );

  const orderRows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (orders.data ?? [])
      .filter(
        (order) =>
          (!proveedor || order.supplier.id === proveedor) &&
          inRange(localDay(order.createdAt), desde, hasta) &&
          (!text ||
            [
              order.label,
              order.supplier.name,
              ...order.lines.map((line) => `${line.productCode} ${line.productName}`),
            ]
              .join(' ')
              .toLowerCase()
              .includes(text)),
      )
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [orders.data, proveedor, desde, hasta, q]);
  const urgentRows = useMemo(
    () => (needs.data?.rows ?? []).filter((row) => !isZero(row.toBuy.quantity)),
    [needs.data],
  );
  const chosen = urgentRows.filter((row) => selected.has(row.product.id));

  const createFromUrgent = () => {
    void navigate(
      newOrderPath(
        chosen.map((row) => ({
          productId: row.product.id,
          quantity: roundUpDecimal(row.toBuy.quantity),
          unitCost: costs.get(row.product.id) ?? null,
        })),
      ),
    );
  };

  const urgentColumns: QueryColumn<PurchaseNeed>[] = [
    {
      key: 'code',
      header: 'Código',
      sort: (row) => row.product.code,
      csv: (row) => row.product.code,
      render: (row) => <span className="tabular-nums">{row.product.code}</span>,
    },
    {
      key: 'product',
      header: 'Insumo o mercancía',
      sort: (row) => row.product.name,
      csv: (row) => row.product.name,
      render: (row) => (
        <EntityLink to="product" id={row.product.id}>
          {row.product.name}
        </EntityLink>
      ),
    },
    {
      key: 'required',
      header: 'Requerido',
      align: 'right',
      csv: (row) => csvQty(row.required),
      render: (row) => <Qty value={row.required} />,
    },
    {
      key: 'onHand',
      header: 'En bodega',
      align: 'right',
      csv: (row) => csvQty(row.onHand),
      render: (row) => <Qty value={row.onHand} />,
    },
    {
      key: 'onOrder',
      header: 'En tránsito',
      align: 'right',
      csv: (row) => csvQty(row.onOrder),
      render: (row) => (
        <span
          title={
            row.inTransit.map((transit) => `${transit.label} · ${transit.supplier}`).join('\n') ||
            undefined
          }
        >
          <Qty value={row.onOrder} dimZero />
        </span>
      ),
    },
    {
      key: 'toBuy',
      header: 'Falta comprar',
      align: 'right',
      sort: (row) => Number(row.toBuy.quantity),
      csv: (row) => csvQty(row.toBuy),
      render: (row) => <Qty value={row.toBuy} emphasis className="text-critical" />,
    },
    {
      key: 'cost',
      header: 'Costo unit.',
      align: 'right',
      hideOnMobile: true,
      csv: (row) => costs.get(row.product.id) ?? '',
      render: (row) => formatCop(costs.get(row.product.id) ?? null),
    },
    {
      key: 'value',
      header: 'Valor estimado',
      align: 'right',
      sort: (row) =>
        Number(amountOf(roundUpDecimal(row.toBuy.quantity), costs.get(row.product.id) ?? null)),
      csv: (row) =>
        amountOf(roundUpDecimal(row.toBuy.quantity), costs.get(row.product.id) ?? null).toString(),
      render: (row) =>
        formatCop(
          amountOf(
            roundUpDecimal(row.toBuy.quantity),
            costs.get(row.product.id) ?? null,
          ).toString(),
        ),
      total: (rows) =>
        sumCop(rows, (row) =>
          amountOf(roundUpDecimal(row.toBuy.quantity), costs.get(row.product.id) ?? null),
        ),
    },
    {
      key: 'usedBy',
      header: 'Para',
      hideOnMobile: true,
      csv: (row) => row.usedBy.map((product) => product.code).join(', '),
      render: (row) =>
        row.usedBy.length === 0 ? (
          <span className="text-ink-3">Reventa</span>
        ) : (
          <span className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-2">
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
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label:
              chosen.length > 0
                ? `Nueva orden de compra con ${String(chosen.length)} producto${chosen.length === 1 ? '' : 's'}`
                : 'Nueva orden de compra',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !canWrite,
            onClick: () => {
              if (chosen.length > 0) createFromUrgent();
              else void navigate('/compras/nueva');
            },
          },
          {
            label: 'Plan de compras del mes',
            icon: CalendarRange,
            to: '/compras/plan',
            hidden: !has('monthlyPlan'),
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
      />
      <ScreenTitle
        title="Órdenes de compra"
        subtitle="Lo pedido a los proveedores y lo que falta por llegar. Recepción registra cada entrada de almacén contra su orden. Enter abre la orden."
      />

      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Estado">
              <select
                className={SELECT}
                value={filters.draft.estado}
                onChange={(event) => {
                  filters.set('estado', event.target.value);
                }}
              >
                <option value="OPEN,PARTIAL">En tránsito y recibidas parcial</option>
                <option value="OPEN">En tránsito</option>
                <option value="PARTIAL">Recibidas parcial</option>
                <option value="RECEIVED,CLOSED">Recibidas y cerradas</option>
                <option value="CANCELLED">Anuladas</option>
                <option value="">Todas</option>
              </select>
            </FilterField>
            <FilterField label="Proveedor">
              <select
                className={`${SELECT} max-w-64`}
                value={filters.draft.proveedor}
                onChange={(event) => {
                  filters.set('proveedor', event.target.value);
                }}
              >
                <option value="">Todos</option>
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Elaborada desde">
              <input
                type="date"
                className={INPUT}
                value={filters.draft.desde}
                onChange={(event) => {
                  filters.set('desde', event.target.value);
                }}
              />
            </FilterField>
            <FilterField label="Hasta">
              <input
                type="date"
                className={INPUT}
                value={filters.draft.hasta}
                onChange={(event) => {
                  filters.set('hasta', event.target.value);
                }}
              />
            </FilterField>
            <FilterField label="Número o producto" className="w-full sm:w-52">
              <input
                className={INPUT}
                value={filters.draft.q}
                onChange={(event) => {
                  filters.set('q', event.target.value);
                }}
              />
            </FilterField>
          </FilterBar>
        }
      >
        <QueryView query={orders}>
          {() => (
            <QueryGrid<PurchaseOrder>
              title="Órdenes de compra"
              columns={ORDER_COLUMNS}
              rows={orderRows}
              rowKey={(row) => row.id}
              onOpen={(row) => {
                void navigate(`/compras/ordenes/${row.id}`);
              }}
              rowClassName={(row) => (row.status === 'CANCELLED' ? 'text-ink-3' : undefined)}
              empty="No hay órdenes de compra con estos filtros."
            />
          )}
        </QueryView>
      </QueryPanel>

      {canWrite ? (
        <QueryPanel
          title="Compra urgente"
          description="Lo que falta para cumplir lo ya vendido: requerido por los pedidos, menos lo que hay en bodega y lo que viene en camino. Marca y pulsa F9."
        >
          <QueryView query={needs}>
            {() => (
              <QueryGrid<PurchaseNeed>
                title="Compra urgente"
                columns={urgentColumns}
                rows={urgentRows}
                rowKey={(row) => row.product.id}
                selectable
                selected={selected}
                onSelectedChange={setSelected}
                actions={
                  chosen.length > 0 ? (
                    <Button
                      size="sm"
                      icon={<FilePlus2 className="size-3.5" />}
                      onClick={createFromUrgent}
                    >
                      Crear orden de compra
                    </Button>
                  ) : null
                }
                onOpen={(row) => {
                  void navigate(`/productos/${row.product.id}`);
                }}
                empty="No falta nada para lo vendido: las existencias y lo que viene en camino cubren los pedidos."
              />
            )}
          </QueryView>
        </QueryPanel>
      ) : null}
    </>
  );
}

const receivedShare = (order: PurchaseOrder) => {
  const total = BigInt(order.total);
  if (total === 0n) return 0;
  return Number(((total - pendingValue(order)) * 100n) / total);
};

const ORDER_COLUMNS: QueryColumn<PurchaseOrder>[] = [
  {
    key: 'label',
    header: 'Número',
    sort: (row) => row.label,
    csv: (row) => row.label,
    render: (row) => (
      <EntityLink to="purchase-order" id={row.id} className="font-medium">
        {row.label}
      </EntityLink>
    ),
  },
  {
    key: 'date',
    header: 'Fecha',
    sort: (row) => row.createdAt,
    csv: (row) => localDay(row.createdAt),
    render: (row) => (
      <span className="whitespace-nowrap">{formatDate(localDay(row.createdAt))}</span>
    ),
  },
  {
    key: 'supplier',
    header: 'Proveedor',
    sort: (row) => row.supplier.name,
    csv: (row) => row.supplier.name,
    render: (row) => (
      <span className="block max-w-56 truncate" title={row.supplier.name}>
        {row.supplier.name}
      </span>
    ),
  },
  {
    key: 'expected',
    header: 'Fecha esperada',
    sort: (row) => row.expectedDate ?? '9999',
    csv: (row) => row.expectedDate ?? '',
    render: (row) => (
      <DateCell date={row.expectedDate} pending={isOpen(row)} lateLabel="No ha llegado" />
    ),
  },
  {
    key: 'status',
    header: 'Estado',
    sort: (row) => row.status,
    csv: (row) => row.statusLabel,
    render: (row) => <PurchaseStatusChip status={row.status} />,
  },
  {
    key: 'lines',
    header: 'Productos',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => row.lines.length,
    render: (row) => row.lines.length,
  },
  {
    key: 'received',
    header: 'Recibido',
    align: 'right',
    hideOnMobile: true,
    sort: receivedShare,
    csv: (row) => `${String(receivedShare(row))} %`,
    render: (row) =>
      row.status === 'CANCELLED' ? (
        <span className="text-ink-3">—</span>
      ) : (
        `${String(receivedShare(row))} %`
      ),
  },
  {
    key: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    sort: (row) => Number(row.total),
    csv: (row) => row.total,
    render: (row) => formatCop(row.total),
    total: (rows) => sumCop(rows, (row) => row.total),
  },
  {
    key: 'tax',
    optional: true,
    header: 'IVA',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => vatOf(BigInt(row.total)).toString(),
    render: (row) => formatCop(vatOf(BigInt(row.total)).toString()),
    total: (rows) => sumCop(rows, (row) => vatOf(BigInt(row.total))),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    csv: (row) => (BigInt(row.total) + vatOf(BigInt(row.total))).toString(),
    render: (row) => (
      <span className="font-medium">
        {formatCop((BigInt(row.total) + vatOf(BigInt(row.total))).toString())}
      </span>
    ),
    total: (rows) => sumCop(rows, (row) => BigInt(row.total) + vatOf(BigInt(row.total))),
  },
  {
    key: 'pending',
    header: 'Por recibir',
    align: 'right',
    csv: (row) => (isOpen(row) ? pendingValue(row).toString() : '0'),
    render: (row) =>
      isOpen(row) ? formatCop(pendingValue(row).toString()) : <span className="text-ink-3">—</span>,
    total: (rows) => sumCop(rows, (row) => (isOpen(row) ? pendingValue(row) : 0n)),
  },
  {
    key: 'createdBy',
    optional: true,
    header: 'Elaboró',
    hideOnMobile: true,
    csv: (row) => row.createdBy,
    render: (row) => <span className="text-ink-2">{row.createdBy}</span>,
  },
];
