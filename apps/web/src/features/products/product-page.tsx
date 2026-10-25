import { CircleCheck, Factory, Link2, ShoppingCart, Tags } from 'lucide-react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import {
  useAvailability,
  useMovements,
  useOrders,
  useProduct,
  useProductionNeeds,
  useProductionOrders,
  usePurchaseNeeds,
  usePurchaseOrders,
  useStockStatus,
  useWhereUsed,
} from '../../api/hooks';
import type { Product, ProductionOrder, PurchaseOrder, Q, SalesOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { BackLink, EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import {
  Chip,
  DueDate,
  OrderStatusChip,
  ProductionStatusChip,
  PurchaseStatusChip,
} from '../../components/status';
import { EmptyState, PageHeader, Panel, QueryView, Spinner } from '../../components/ui';
import { formatDate, formatDecimal, unitLabel } from '../../lib/format';
import { MovementTable } from '../inventory/movement-table';
import { FormulaSection } from './formula-section';

/**
 * Everything about one product in one place: stock, who asked for it, how it is made, what is being
 * produced or bought. Each section appears only for the panels that work with it.
 */
export function ProductPage() {
  const { id } = useParams();
  const product = useProduct(id);
  return <QueryView query={product}>{(data) => <ProductView product={data} />}</QueryView>;
}

function ProductView({ product }: { product: Product }) {
  const { has, home } = useAccess();
  const { can } = useSession();
  const raw = product.type === 'RAW_MATERIAL';
  const finished = product.type === 'FINISHED_GOOD';

  const sections = {
    orders: finished && (has('summary') || has('sales') || has('home') || has('plant')),
    production: !raw && has('plant'),
    purchases: raw && (has('purchasing') || (has('inventory') && can('purchasing:receive'))),
    kardex: has('inventory'),
    formula: !raw && (has('catalog') || has('plant')),
    whereUsed: !finished && (has('catalog') || has('plant') || has('purchasing')),
  };
  const fallback = has('catalog') ? '/catalogo' : has('inventory') ? '/inventario' : home;

  return (
    <>
      <BackLink fallback={fallback} label="Volver" />
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-ink-2">
              {product.code}
            </span>
            <span>
              {product.typeLabel} · se maneja en {unitLabel(product.stockUnit)}
            </span>
            {product.active ? null : (
              <Chip tone="neutral" icon={CircleCheck}>
                Desactivado
              </Chip>
            )}
          </span>
        }
      />

      {can('inventory:read') ? <StockStrip product={product} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {sections.orders ? <OrdersSection product={product} /> : null}
          {sections.production ? <ProductionSection product={product} /> : null}
          {sections.purchases ? <PurchasesSection product={product} /> : null}
          {sections.kardex ? <KardexSection product={product} /> : null}
        </div>
        <div className="flex flex-col gap-6">
          {sections.formula ? <FormulaSection product={product} /> : null}
          {sections.whereUsed ? <WhereUsedSection product={product} /> : null}
        </div>
      </div>
    </>
  );
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-line bg-surface p-4">
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="mt-1.5 text-[22px] leading-tight">{children}</p>
      {hint ? <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** Stock, plus the one planning figure that matters for this kind of product and this user. */
function StockStrip({ product }: { product: Product }) {
  const status = useStockStatus({ q: product.code });
  const row = status.data?.find((candidate) => candidate.productId === product.id);
  if (status.isPending) return <Spinner />;
  const zero: Q = { quantity: '0', unit: product.stockUnit };
  const byWarehouse = row?.byWarehouse
    .map((w) => `${w.warehouseName}: ${formatDecimal(w.onHand.quantity)}`)
    .join(' · ');
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Físico" hint={byWarehouse ?? 'Sin movimientos'}>
        <Qty value={row?.onHand ?? zero} emphasis />
      </Stat>
      <Stat label="Comprometido en preventas">
        <Qty value={row?.reserved ?? zero} emphasis dimZero />
      </Stat>
      <Stat label="Disponible">
        <Qty value={row?.available ?? zero} emphasis />
      </Stat>
      <PlanningStat product={product} />
    </div>
  );
}

function PlanningStat({ product }: { product: Product }) {
  const { has } = useAccess();
  if (product.type === 'FINISHED_GOOD' && (has('summary') || has('sales') || has('home')))
    return <PromisableStat product={product} />;
  if (product.type === 'RAW_MATERIAL' && has('purchasing')) return <ToBuyStat product={product} />;
  if (product.type !== 'RAW_MATERIAL' && has('plant')) return <ToMakeStat product={product} />;
  return null;
}

function PromisableStat({ product }: { product: Product }) {
  const availability = useAvailability();
  const row = availability.data?.rows.find((candidate) => candidate.product.id === product.id);
  return (
    <Stat
      label="Puedes prometer"
      hint={row?.limitingMaterial ? `Lo limita: ${row.limitingMaterial.name}` : undefined}
    >
      {row ? <Qty value={row.promisable} emphasis /> : '—'}
    </Stat>
  );
}

function ToBuyStat({ product }: { product: Product }) {
  const needs = usePurchaseNeeds();
  const row = needs.data?.rows.find((candidate) => candidate.product.id === product.id);
  return (
    <Stat label="Por comprar" hint="Exactamente el faltante, ya descontado lo que viene en camino">
      {row ? <Qty value={row.toBuy} emphasis dimZero /> : <span className="text-ink-3">0</span>}
    </Stat>
  );
}

function ToMakeStat({ product }: { product: Product }) {
  const needs = useProductionNeeds();
  const pending =
    product.type === 'BULK'
      ? needs.data?.bulk.find((row) => row.product.id === product.id)?.pendingToSchedule
      : needs.data?.packaging.find((row) => row.product.id === product.id)?.pendingToSchedule;
  return (
    <Stat
      label={product.type === 'BULK' ? 'Falta programar producir' : 'Falta programar envasar'}
      hint="Para las preventas confirmadas, descontado lo ya programado"
    >
      {pending ? <Qty value={pending} emphasis dimZero /> : <span className="text-ink-3">0</span>}
    </Stat>
  );
}

function OrdersSection({ product }: { product: Product }) {
  const orders = useOrders({ productId: product.id, status: 'DRAFT,CONFIRMED' });
  const quantityOf = (order: SalesOrder) =>
    order.lines.find((line) => line.productId === product.id)?.quantity;
  return (
    <Panel
      title="Preventas abiertas que lo piden"
      description="Confirmadas y borradores, por fecha de entrega."
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<SalesOrder>
            label="Preventas"
            rows={[...rows].sort((a, b) =>
              (a.estimatedDeliveryDate ?? '9').localeCompare(b.estimatedDeliveryDate ?? '9'),
            )}
            rowKey={(row) => row.id}
            empty={<EmptyState icon={<Tags />} title="Nadie lo tiene en una preventa abierta" />}
            columns={[
              {
                key: 'order',
                header: 'Preventa',
                render: (row) => (
                  <EntityLink to="order" id={row.id} className="font-medium">
                    {row.label}
                  </EntityLink>
                ),
              },
              {
                key: 'customer',
                header: 'Cliente',
                render: (row) => (
                  <EntityLink to="customer" id={row.customer.id}>
                    {row.customer.name}
                  </EntityLink>
                ),
              },
              {
                key: 'seller',
                header: 'Vendedor',
                hideOnMobile: true,
                render: (row) => row.seller.name,
              },
              {
                key: 'delivery',
                header: 'Entrega',
                render: (row) => <DueDate date={row.estimatedDeliveryDate} />,
              },
              {
                key: 'quantity',
                header: 'Cantidad',
                align: 'right',
                render: (row) => {
                  const quantity = quantityOf(row);
                  return quantity ? <Qty value={quantity} emphasis /> : '—';
                },
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <OrderStatusChip status={row.status} />,
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

function ProductionSection({ product }: { product: Product }) {
  const orders = useProductionOrders(undefined, product.id);
  return (
    <Panel
      title="Órdenes de producción"
      description={product.type === 'BULK' ? 'Baches de granel.' : 'Envasado.'}
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<ProductionOrder>
            label="Órdenes de producción"
            rows={rows.slice(0, 15)}
            rowKey={(row) => row.id}
            empty={
              <EmptyState icon={<Factory />} title="Todavía no hay órdenes para este producto" />
            }
            columns={[
              {
                key: 'label',
                header: 'Orden',
                render: (row) => (
                  <EntityLink to="production-order" id={row.id} className="font-medium">
                    {row.label}
                  </EntityLink>
                ),
              },
              {
                key: 'quantity',
                header: 'Cantidad',
                align: 'right',
                render: (row) => <Qty value={row.producedQuantity ?? row.plannedQuantity} />,
              },
              {
                key: 'date',
                header: 'Fecha',
                render: (row) =>
                  row.status === 'PLANNED' ? (
                    <DueDate date={row.scheduledDate} />
                  ) : (
                    formatDate(row.completedAt ?? row.cancelledAt ?? row.scheduledDate)
                  ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <ProductionStatusChip status={row.status} />,
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

function PurchasesSection({ product }: { product: Product }) {
  const orders = usePurchaseOrders(undefined, product.id);
  const lineOf = (order: PurchaseOrder) =>
    order.lines.find((line) => line.productId === product.id);
  return (
    <Panel title="Compras" description="Pedidos a proveedores que incluyen este insumo." flush>
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<PurchaseOrder>
            label="Compras"
            rows={rows.slice(0, 15)}
            rowKey={(row) => row.id}
            empty={
              <EmptyState icon={<ShoppingCart />} title="Todavía no se ha pedido este insumo" />
            }
            columns={[
              {
                key: 'label',
                header: 'Orden',
                render: (row) => (
                  <span>
                    <EntityLink to="purchase-order" id={row.id} className="font-medium">
                      {row.label}
                    </EntityLink>
                    <span className="block text-[12.5px] text-ink-3">{row.supplier}</span>
                  </span>
                ),
              },
              {
                key: 'quantity',
                header: 'Cantidad',
                align: 'right',
                render: (row) => {
                  const line = lineOf(row);
                  return line ? <Qty value={line.receivedQuantity ?? line.quantity} /> : '—';
                },
              },
              {
                key: 'date',
                header: 'Llega',
                render: (row) =>
                  row.status === 'OPEN' ? (
                    <DueDate date={row.expectedDate} />
                  ) : (
                    formatDate(row.receivedAt ?? row.expectedDate)
                  ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <PurchaseStatusChip status={row.status} />,
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

function KardexSection({ product }: { product: Product }) {
  const movements = useMovements({ productId: product.id });
  return (
    <Panel title="Movimientos" description="Kardex: cada entrada y salida con su saldo." flush>
      <QueryView query={movements}>
        {(rows) => <MovementTable rows={rows} showProduct={false} />}
      </QueryView>
    </Panel>
  );
}

function WhereUsedSection({ product }: { product: Product }) {
  const users = useWhereUsed(product.id);
  return (
    <Panel title="Se usa en" description="Productos cuya fórmula vigente lo consume.">
      <QueryView query={users}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-ink-3">Ninguna fórmula vigente lo usa.</p>
          ) : (
            <ul className="flex flex-col gap-2.5 text-sm">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-2.5">
                  <Link2 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                  <span>
                    <EntityLink to="product" id={row.id} className="font-medium">
                      {row.name}
                    </EntityLink>
                    <span className="block text-[12.5px] text-ink-3">
                      {row.code} · {row.typeLabel}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </Panel>
  );
}
