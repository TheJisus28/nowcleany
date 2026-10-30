import {
  CalendarRange,
  CircleCheck,
  Clock,
  PackageOpen,
  Plus,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProducts, usePurchaseNeeds, usePurchaseOrders } from '../../api/hooks';
import type { PurchaseNeed, PurchaseOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { EntityLink, pathTo, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { DueDate, PurchaseStatusChip } from '../../components/status';
import {
  Button,
  cn,
  EmptyState,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
} from '../../components/ui';
import {
  daysUntil,
  formatCop,
  formatCopShort,
  formatDate,
  formatDecimal,
  isZero,
  plural,
  roundUpDecimal,
} from '../../lib/format';
import { moneyInput, pendingValue } from './money';
import { PurchaseOrderActions } from './order-actions';
import { PurchaseOrderDialog, type PurchaseDraftLine } from './purchase-order-dialog';

const inTransit = (order: PurchaseOrder) => order.status === 'OPEN' || order.status === 'PARTIAL';

export function PurchasingPage() {
  const { can } = useSession();
  const { has } = useAccess();
  const [draft, setDraft] = useState<PurchaseDraftLine[] | null>(null);

  return (
    <>
      <PageHeader
        title="Órdenes de compra"
        description="Lo pedido a los proveedores y lo que falta por llegar. Recepción ingresa cada factura del proveedor contra su orden."
        actions={
          <>
            {has('monthlyPlan') ? (
              <Link
                to="/compras/plan"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"
              >
                <CalendarRange aria-hidden className="size-4" />
                Plan del mes
              </Link>
            ) : null}
            {can('purchasing:write') ? (
              <Button
                icon={<Plus className="size-4" />}
                onClick={() => {
                  setDraft([]);
                }}
              >
                Nueva orden de compra
              </Button>
            ) : null}
          </>
        }
      />

      <TransitKpis />

      {can('purchasing:write') ? <UrgentNeeds onDraft={setDraft} /> : null}

      <PurchaseOrders />

      {draft ? (
        <PurchaseOrderDialog
          initial={draft}
          onClose={() => {
            setDraft(null);
          }}
        />
      ) : null}
    </>
  );
}

function TransitKpis() {
  const orders = usePurchaseOrders('OPEN,PARTIAL');
  const rows = orders.data ?? [];
  const late = rows.filter((order) => (daysUntil(order.expectedDate) ?? 0) < 0);
  const partial = rows.filter((order) => order.status === 'PARTIAL');
  const value = rows.reduce((sum, order) => sum + pendingValue(order), 0n);
  const loading = orders.isPending ? '…' : null;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="En tránsito"
        value={loading ?? rows.length}
        icon={Truck}
        tone="brand"
        hint={plural(new Set(rows.map((o) => o.supplier.id)).size, 'proveedor', 'proveedores')}
      />
      <Kpi
        label="Recibidas parcial"
        value={loading ?? partial.length}
        icon={PackageOpen}
        tone={partial.length > 0 ? 'warning' : 'neutral'}
        hint="Llegó una parte; el resto sigue pendiente"
      />
      <Kpi
        label="Atrasadas"
        value={loading ?? late.length}
        icon={Clock}
        tone={late.length > 0 ? 'critical' : 'good'}
        hint={late.length > 0 ? 'Pasó la fecha esperada' : 'Todo dentro de la fecha'}
      />
      <Kpi
        label="Valor por llegar"
        value={
          loading ?? (
            <span title={formatCop(value.toString())}>{formatCopShort(value.toString())}</span>
          )
        }
        icon={Wallet}
        hint="Lo pendiente al costo pactado, antes de IVA"
      />
    </div>
  );
}

/** What is missing for orders already sold (exact shortage; no safety stock). */
function UrgentNeeds({ onDraft }: { onDraft: (lines: PurchaseDraftLine[]) => void }) {
  const needs = usePurchaseNeeds();
  const products = useProducts({ active: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<'buy' | 'all'>('buy');
  const costs = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product.cost])),
    [products.data],
  );
  const toBuy = needs.data?.rows.filter((row) => !isZero(row.toBuy.quantity)) ?? [];

  return (
    <Panel
      title="Compra urgente"
      description="Lo que falta para cumplir lo ya vendido: requerido por los pedidos, menos lo que hay en bodega y lo que ya viene en camino."
      className="mb-6"
      actions={
        needs.data ? (
          <>
            <Segmented
              label="Mostrar"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'buy', label: `Falta · ${String(toBuy.length)}` },
                { value: 'all', label: `Todos · ${String(needs.data.rows.length)}` },
              ]}
            />
            <Button
              icon={<ShoppingCart className="size-4" />}
              disabled={selected.size === 0}
              onClick={() => {
                onDraft(
                  needs.data.rows
                    .filter((row) => selected.has(row.product.id))
                    .map((row) => ({
                      productId: row.product.id,
                      quantity: formatDecimal(roundUpDecimal(row.toBuy.quantity)),
                      unitCost: moneyInput(costs.get(row.product.id)),
                    })),
                );
                setSelected(new Set());
              }}
            >
              {selected.size > 0
                ? `Pedir ${plural(selected.size, 'producto', 'productos')}`
                : 'Pedir lo seleccionado'}
            </Button>
          </>
        ) : null
      }
      flush
    >
      <QueryView query={needs}>
        {(data) => (
          <DataTable<PurchaseNeed>
            label="Compra urgente"
            rows={scope === 'buy' ? toBuy : data.rows}
            rowKey={(row) => row.product.id}
            rowClassName={(row) => (isZero(row.toBuy.quantity) ? 'text-ink-2' : undefined)}
            empty={
              <EmptyState
                icon={<CircleCheck />}
                title="No falta nada para lo vendido"
                description="Las existencias y lo que viene en camino cubren todos los pedidos."
              />
            }
            columns={[
              {
                key: 'material',
                header: 'Producto',
                render: (row) => (
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Incluir ${row.product.name}`}
                      className="mt-1 size-4 shrink-0 accent-[#003858]"
                      disabled={isZero(row.toBuy.quantity)}
                      checked={selected.has(row.product.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(row.product.id);
                        else next.delete(row.product.id);
                        setSelected(next);
                      }}
                    />
                    <ProductCell product={row.product} />
                  </span>
                ),
              },
              {
                key: 'required',
                header: 'Requerido',
                align: 'right',
                render: (row) => <Qty value={row.required} />,
              },
              {
                key: 'onHand',
                header: 'En bodega',
                align: 'right',
                render: (row) => <Qty value={row.onHand} />,
              },
              {
                key: 'onOrder',
                header: 'En tránsito',
                align: 'right',
                render: (row) => (
                  <span>
                    <Qty value={row.onOrder} dimZero />
                    {row.inTransit.map((transit) => (
                      <span key={transit.orderId} className="block text-[12px] text-ink-3">
                        <EntityLink to="purchase-order" id={transit.orderId}>
                          {transit.label}
                        </EntityLink>
                      </span>
                    ))}
                  </span>
                ),
              },
              {
                key: 'toBuy',
                header: 'Falta',
                align: 'right',
                render: (row) => (
                  <Qty
                    value={row.toBuy}
                    emphasis
                    dimZero
                    className={cn(!isZero(row.toBuy.quantity) && 'text-critical')}
                  />
                ),
              },
              {
                key: 'usedBy',
                header: 'Para',
                hideOnMobile: true,
                render: (row) =>
                  row.usedBy.length === 0 ? (
                    <span className="text-ink-3">Reventa</span>
                  ) : (
                    <span className="flex flex-wrap gap-x-2 text-[13px] text-ink-2">
                      {row.usedBy.map((product) => (
                        <EntityLink key={product.id} to="product" id={product.id}>
                          <span title={product.name}>{product.code}</span>
                        </EntityLink>
                      ))}
                    </span>
                  ),
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

const FILTERS = [
  { value: 'OPEN,PARTIAL', label: 'En tránsito' },
  { value: 'RECEIVED,CLOSED', label: 'Recibidas' },
  { value: 'CANCELLED', label: 'Anuladas' },
  { value: 'ALL', label: 'Todas' },
] as const;

function PurchaseOrders() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('OPEN,PARTIAL');
  const orders = usePurchaseOrders(filter === 'ALL' ? undefined : filter);

  return (
    <Panel
      title="Órdenes"
      description="Cada línea muestra lo recibido de lo pedido. Una orden puede recibir varias facturas."
      actions={<Segmented label="Estado" value={filter} onChange={setFilter} options={FILTERS} />}
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<PurchaseOrder>
            label="Órdenes de compra"
            rows={[...rows].sort((a, b) =>
              inTransit(a) && inTransit(b)
                ? (a.expectedDate ?? '9').localeCompare(b.expectedDate ?? '9')
                : b.createdAt.localeCompare(a.createdAt),
            )}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              void navigate(pathTo('purchase-order', row.id));
            }}
            empty={<EmptyState icon={<Truck />} title="No hay órdenes con este estado" />}
            columns={[
              {
                key: 'label',
                header: 'Orden',
                render: (row) => (
                  <span>
                    <EntityLink to="purchase-order" id={row.id} className="font-medium">
                      {row.label}
                    </EntityLink>
                    <span className="block text-[12.5px] text-ink-3">{row.supplier.name}</span>
                  </span>
                ),
              },
              {
                key: 'lines',
                header: 'Recibido de lo pedido',
                render: (row) => (
                  <ul className="flex flex-col gap-0.5 text-[13px]">
                    {row.lines.map((line) => (
                      <li key={line.productId} className="whitespace-nowrap">
                        <EntityLink to="product" id={line.productId}>
                          <span title={line.productName}>{line.productCode}</span>
                        </EntityLink>
                        :{' '}
                        <span className={cn(isZero(line.pending.quantity) && 'text-good')}>
                          {formatDecimal(roundUpDecimal(line.received.quantity))}
                        </span>{' '}
                        / <Qty value={line.quantity} />
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'expected',
                header: 'Llega',
                render: (row) =>
                  inTransit(row) ? (
                    <DueDate date={row.expectedDate} lateLabel="No ha llegado" />
                  ) : (
                    formatDate(row.receivedAt ?? row.cancelledAt ?? row.expectedDate)
                  ),
              },
              {
                key: 'total',
                header: 'Valor',
                align: 'right',
                render: (row) => (
                  <span>
                    {formatCop(row.total)}
                    {row.status === 'PARTIAL' ? (
                      <span className="block text-[12px] text-ink-3">
                        falta {formatCop(pendingValue(row).toString())}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <PurchaseStatusChip status={row.status} />,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                hideOnMobile: true,
                render: (row) => <PurchaseOrderActions order={row} />,
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}
