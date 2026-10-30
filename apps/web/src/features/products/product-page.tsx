import { CircleCheck, Factory, Link2, Pencil, Power, ShoppingCart, Tags } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useParams } from 'react-router';
import {
  useAction,
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
import { Button, cn, EmptyState, PageHeader, Panel, QueryView, Spinner } from '../../components/ui';
import { api } from '../../api/client';
import { formatCop, formatDate, formatDecimal, unitLabel } from '../../lib/format';
import { MovementTable } from '../inventory/movement-table';
import { FormulaSection } from './formula-section';
import { ProductFormDialog } from './product-form-dialog';

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
  const bulk = product.type === 'BULK';
  const finished = product.type === 'FINISHED_GOOD';
  const resale = product.type === 'RESALE';
  const made = bulk || finished;

  const sections = {
    orders: (finished || resale) && (has('summary') || has('sales') || has('home') || has('plant')),
    production: made && has('plant'),
    purchases: (raw || resale) && (has('purchasing') || has('monthlyPlan') || has('receiving')),
    kardex: has('inventory'),
    formula: made && (has('catalog') || has('plant')),
    whereUsed: (raw || bulk) && (has('catalog') || has('plant') || has('purchasing')),
    pricing: !bulk,
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
        actions={can('products:write') ? <ProductActions product={product} /> : null}
      />

      {can('inventory:read') ? <StockStrip product={product} /> : null}

      {sections.orders || sections.production || sections.purchases || sections.kardex ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            {sections.orders ? <OrdersSection product={product} /> : null}
            {sections.production ? <ProductionSection product={product} /> : null}
            {sections.purchases ? <PurchasesSection product={product} /> : null}
            {sections.kardex ? <KardexSection product={product} /> : null}
          </div>
          <div className="flex flex-col gap-6">
            {sections.pricing ? <PricingSection product={product} /> : null}
            {sections.formula ? <FormulaSection product={product} /> : null}
            {sections.whereUsed ? <WhereUsedSection product={product} /> : null}
          </div>
        </div>
      ) : (
        // Formulation only sees how the product is made: give it the full width.
        <div className="grid max-w-4xl gap-6">
          {sections.pricing ? <PricingSection product={product} /> : null}
          {sections.formula ? <FormulaSection product={product} /> : null}
          {sections.whereUsed ? <WhereUsedSection product={product} /> : null}
        </div>
      )}
    </>
  );
}

/** Edit name, batch size, price and cost, or deactivate (products are never deleted: history points to them). */
function ProductActions({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const toggle = useAction(
    () => api.patch<Product>(`/v1/products/${product.id}`, { active: !product.active }),
    {
      success: (saved) =>
        saved.active
          ? `${saved.code} activado`
          : `${saved.code} desactivado: no aparece para vender ni planear`,
    },
  );
  return (
    <>
      <Button
        variant="secondary"
        icon={<Pencil className="size-4" />}
        onClick={() => {
          setEditing(true);
        }}
      >
        Editar
      </Button>
      <Button
        variant="ghost"
        icon={<Power className="size-4" />}
        loading={toggle.isPending}
        onClick={() => {
          toggle.mutate(undefined);
        }}
      >
        {product.active ? 'Desactivar' : 'Activar'}
      </Button>
      {editing ? (
        <ProductFormDialog
          product={product}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
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
        <Qty value={row?.committed ?? zero} emphasis dimZero />
      </Stat>
      <Stat label="Proyectado" hint="Físico menos lo comprometido">
        <Qty value={row?.projected ?? zero} emphasis />
      </Stat>
      <PlanningStat product={product} />
    </div>
  );
}

function PlanningStat({ product }: { product: Product }) {
  const { has } = useAccess();
  const purchasable = product.type === 'RAW_MATERIAL' || product.type === 'RESALE';
  const made = product.type === 'BULK' || product.type === 'FINISHED_GOOD';
  if (product.type === 'FINISHED_GOOD' && (has('summary') || has('sales') || has('home')))
    return <PromisableStat product={product} />;
  if (purchasable && (has('purchasing') || has('monthlyPlan')))
    return <ToBuyStat product={product} />;
  if (made && has('plant')) return <ToMakeStat product={product} />;
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
  const orders = useOrders({
    productId: product.id,
    status: 'DRAFT,CONFIRMED,INVOICED,READY,PARTIAL',
  });
  const quantityOf = (order: SalesOrder) =>
    order.lines.find((line) => line.productId === product.id)?.pending;
  return (
    <Panel
      title="Pedidos abiertos que lo piden"
      description="Borradores y pedidos que aún no se despachan completos, por fecha de entrega."
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
            empty={<EmptyState icon={<Tags />} title="Nadie lo tiene en un pedido abierto" />}
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
                header: 'Por despachar',
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
    <Panel
      title="Compras"
      description={`Órdenes a proveedores que incluyen este ${product.type === 'RESALE' ? 'producto' : 'insumo'}.`}
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<PurchaseOrder>
            label="Compras"
            rows={rows.slice(0, 15)}
            rowKey={(row) => row.id}
            empty={
              <EmptyState icon={<ShoppingCart />} title="Todavía no se ha pedido a un proveedor" />
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
                    <span className="block text-[12.5px] text-ink-3">{row.supplier.name}</span>
                  </span>
                ),
              },
              {
                key: 'quantity',
                header: 'Recibido / pedido',
                align: 'right',
                render: (row) => {
                  const line = lineOf(row);
                  return line ? (
                    <span className="whitespace-nowrap">
                      <Qty value={line.received} dimZero />
                      <span className="text-ink-3"> / </span>
                      <Qty value={line.quantity} emphasis />
                    </span>
                  ) : (
                    '—'
                  );
                },
              },
              {
                key: 'cost',
                header: 'Costo',
                align: 'right',
                hideOnMobile: true,
                render: (row) => {
                  const line = lineOf(row);
                  return line ? formatCop(line.unitCost) : '—';
                },
              },
              {
                key: 'date',
                header: 'Llega',
                render: (row) =>
                  row.status === 'OPEN' || row.status === 'PARTIAL' ? (
                    <DueDate date={row.expectedDate} lateLabel="No ha llegado" />
                  ) : (
                    formatDate(row.receivedAt ?? row.cancelledAt ?? row.expectedDate)
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

/** Sale price and purchase cost per stock unit (and the gross margin of resale goods). */
function PricingSection({ product }: { product: Product }) {
  const unit = unitLabel(product.stockUnit);
  const sold = product.type === 'FINISHED_GOOD' || product.type === 'RESALE';
  const bought = product.type === 'RAW_MATERIAL' || product.type === 'RESALE';
  const margin =
    product.type === 'RESALE' && product.price && product.cost && Number(product.price) > 0
      ? Math.round(((Number(product.price) - Number(product.cost)) / Number(product.price)) * 100)
      : null;
  const value = (amount: string | null) =>
    amount ? (
      <span className="text-[22px] leading-tight font-semibold tabular-nums">
        {formatCop(amount)}
        <span className="ml-1 text-[13px] font-normal text-ink-3">por {unit}</span>
      </span>
    ) : (
      <span className="text-sm text-ink-3">Sin definir</span>
    );
  return (
    <Panel title="Precio y costo" description="En pesos por unidad de inventario, antes de IVA.">
      <dl className="grid gap-4">
        {sold ? (
          <div>
            <dt className="text-[13px] text-ink-2">Precio de venta</dt>
            <dd className="mt-0.5">{value(product.price)}</dd>
          </div>
        ) : null}
        {bought ? (
          <div>
            <dt className="text-[13px] text-ink-2">Costo de compra</dt>
            <dd className="mt-0.5">{value(product.cost)}</dd>
          </div>
        ) : null}
        {margin !== null ? (
          <div>
            <dt className="text-[13px] text-ink-2">Margen bruto</dt>
            <dd className={cn('mt-0.5 text-lg font-semibold', margin < 0 && 'text-critical')}>
              {margin} %
            </dd>
          </div>
        ) : null}
      </dl>
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
