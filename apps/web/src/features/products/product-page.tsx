import { PackageSearch, Pencil, Power, Printer, Trash2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import {
  useAction,
  useAvailability,
  useProduct,
  useProductionNeeds,
  useProducts,
  usePurchaseNeeds,
  useStockStatus,
  useWhereUsed,
} from '../../api/hooks';
import type { Product, Q, WhereUsed } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { cn, QueryView } from '../../components/ui';
import { formatCop, formatDecimal, unitLabel } from '../../lib/format';
import { ConfirmDialog, neighbors } from '../inventory/erp-kit';
import { FormulaSection } from './formula-section';
import { ProductFormDialog } from './product-form-dialog';

/**
 * The product record as a master file: header with its data, stock figures, and the documents that
 * move it (orders, production, purchases, kardex) plus how it is made. Each section appears only for
 * the panels that work with it.
 */
export function ProductPage() {
  const { id } = useParams();
  const product = useProduct(id);
  const list = useProducts({});
  const ids = useMemo(
    () =>
      list.data
        ? [...list.data].sort((a, b) => a.code.localeCompare(b.code)).map((row) => row.id)
        : undefined,
    [list.data],
  );
  return (
    <QueryView query={product}>{(data) => <ProductRecord product={data} ids={ids} />}</QueryView>
  );
}

function ProductRecord({ product, ids }: { product: Product; ids: string[] | undefined }) {
  const { has, home } = useAccess();
  const { can } = useSession();
  useWorkTab(`${product.code} · ${product.name}`);
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();
  const raw = product.type === 'RAW_MATERIAL';
  const bulk = product.type === 'BULK';
  const finished = product.type === 'FINISHED_GOOD';
  const resale = product.type === 'RESALE';
  const made = bulk || finished;
  const sold = finished || resale;
  const bought = raw || resale;
  const unit = unitLabel(product.stockUnit);
  const sections = {
    stock: can('inventory:read'),
    orders: sold && (has('operations') || has('sales') || has('home') || has('plant')),
    production: made && (has('plant') || has('production')),
    purchases: bought && (has('purchasing') || has('monthlyPlan') || has('receiving')),
    kardex: has('inventory') || has('kardex'),
    formula: made && (has('catalog') || has('plant')),
    whereUsed: (raw || bulk) && (has('catalog') || has('plant') || has('purchasing')),
  };
  const closeTo = has('catalog') ? '/catalogo' : has('inventory') ? '/inventario' : home;
  const nav = neighbors(ids, product.id, (value) => `/productos/${value}`);
  const margin =
    resale && product.price && product.cost && Number(product.price) > 0
      ? Math.round(((Number(product.price) - Number(product.cost)) / Number(product.price)) * 100)
      : null;

  const remove = useAction(() => api.delete(`/v1/products/${product.id}`), {
    success: `${product.code} eliminado`,
  });
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
      <DocumentScreen
        kind={`Ficha de producto · ${product.typeLabel}`}
        number={product.code}
        status={
          product.active ? (
            <span className="text-[13px] font-medium text-good">Activo</span>
          ) : (
            <span className="text-[13px] font-medium text-ink-3">Desactivado</span>
          )
        }
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Editar',
                icon: Pencil,
                shortcut: 'F2',
                hidden: !can('products:write'),
                onClick: () => {
                  setEditing(true);
                },
              },
              {
                label: product.active ? 'Desactivar' : 'Activar',
                icon: Power,
                danger: product.active,
                hidden: !can('products:write'),
                loading: toggle.isPending,
                onClick: () => {
                  if (product.active) setDeactivating(true);
                  else toggle.mutate(undefined);
                },
              },
              {
                label: 'Eliminar',
                icon: Trash2,
                danger: true,
                hidden: !can('products:write'),
                onClick: () => {
                  setRemoving(true);
                },
              },
              {
                label: 'Kárdex',
                icon: PackageSearch,
                hidden: !has('kardex'),
                to: `/inventario/kardex?producto=${product.id}`,
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
            previous={nav.previous}
            next={nav.next}
            closeTo={closeTo}
          />
        }
      >
        <HeaderGrid>
          <HeaderField label="Descripción" span={2}>
            <span className="font-medium">{product.name}</span>
          </HeaderField>
          <HeaderField label="Tipo">{product.typeLabel}</HeaderField>
          <HeaderField label="Unidad de inventario">{unit}</HeaderField>
          {bulk ? (
            <HeaderField label="Capacidad del bache">
              {product.batchCapacity ? (
                `${formatDecimal(product.batchCapacity.quantity)} ${unitLabel(product.batchCapacity.unit)}`
              ) : (
                <span className="text-ink-3">Sin definir</span>
              )}
            </HeaderField>
          ) : null}
          {sold ? (
            <HeaderField label={`Precio de venta (por ${unit})`}>
              {product.price ? (
                <span className="font-semibold tabular-nums">{formatCop(product.price)}</span>
              ) : (
                <span className="text-ink-3">Sin definir</span>
              )}
            </HeaderField>
          ) : null}
          {bought ? (
            <HeaderField label={`Costo de compra (por ${unit})`}>
              {product.cost ? (
                <span className="font-semibold tabular-nums">{formatCop(product.cost)}</span>
              ) : (
                <span className="text-ink-3">Sin definir</span>
              )}
            </HeaderField>
          ) : null}
          {margin !== null ? (
            <HeaderField label="Margen bruto">
              <span className={cn('font-semibold', margin < 0 && 'text-critical')}>{margin} %</span>
            </HeaderField>
          ) : null}
          {made ? (
            <HeaderField label="Fórmula">
              {product.activeFormulaVersion ? (
                `Vigente v${String(product.activeFormulaVersion)}`
              ) : (
                <span className="text-[#9a6a00]">Sin fórmula vigente</span>
              )}
              {product.hasDraftFormula ? (
                <span className="text-ink-3"> · borrador por publicar</span>
              ) : null}
            </HeaderField>
          ) : null}
        </HeaderGrid>

        {sections.stock ? <StockFigures product={product} /> : null}
        {sections.whereUsed ? <WhereUsedSection product={product} /> : null}
        {sections.formula ? (
          <DocumentSection title="Fórmula">
            <div className="grid gap-4">
              <FormulaSection product={product} />
            </div>
          </DocumentSection>
        ) : null}
      </DocumentScreen>

      {editing ? (
        <ProductFormDialog
          product={product}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deactivating}
        title={`¿Desactivar ${product.code}?`}
        description="Deja de aparecer para vender, comprar y planear. Su historia (pedidos, kárdex) se conserva y se puede volver a activar."
        confirmLabel="Desactivar"
        danger
        loading={toggle.isPending}
        onClose={() => {
          setDeactivating(false);
        }}
        onConfirm={() => {
          toggle.mutate(undefined, {
            onSuccess: () => {
              setDeactivating(false);
            },
          });
        }}
      />
      <ConfirmDialog
        open={removing}
        title={`¿Eliminar ${product.code}?`}
        description="Solo se puede si no tiene movimientos ni se usa en fórmulas o documentos. No se puede deshacer."
        confirmLabel="Eliminar"
        danger
        loading={remove.isPending}
        onClose={() => {
          setRemoving(false);
        }}
        onConfirm={() => {
          remove.mutate(undefined, {
            onSuccess: () => {
              setRemoving(false);
              void navigate(closeTo);
            },
          });
        }}
      />
    </>
  );
}

/** A consultation inside the record, without its own frame. */
function GridSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DocumentSection title={title} flush>
      <div className="border-t border-line [&>div]:rounded-none [&>div]:border-0">{children}</div>
    </DocumentSection>
  );
}

function Figure({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <HeaderField label={label}>
      <span className="text-[16px]">{children}</span>
      {hint ? <span className="block text-[12px] text-ink-3">{hint}</span> : null}
    </HeaderField>
  );
}

/** Stock, plus the one planning figure that matters for this kind of product and this user. */
function StockFigures({ product }: { product: Product }) {
  const { has } = useAccess();
  const status = useStockStatus({ q: product.code });
  const row = status.data?.find((candidate) => candidate.productId === product.id);
  const zero: Q = { quantity: '0', unit: product.stockUnit };
  const at = (code: string) =>
    row?.byWarehouse.find((warehouse) => warehouse.warehouseCode === code)?.onHand ?? zero;
  const purchasable = product.type === 'RAW_MATERIAL' || product.type === 'RESALE';
  const made = product.type === 'BULK' || product.type === 'FINISHED_GOOD';
  return (
    <DocumentSection title="Existencias" flush>
      <HeaderGrid className="border-t border-b-0 lg:grid-cols-6">
        <Figure label="Planta">
          <Qty value={at('PLANTA')} />
        </Figure>
        <Figure label="Despacho">
          <Qty value={at('DESPACHO')} />
        </Figure>
        <Figure label="Físico total">
          <Qty value={row?.onHand ?? zero} emphasis />
        </Figure>
        <Figure label="Comprometido">
          <Qty value={row?.committed ?? zero} dimZero />
        </Figure>
        <Figure label="Proyectado" hint="Físico − comprometido">
          <Qty value={row?.projected ?? zero} emphasis />
        </Figure>
        {product.type === 'FINISHED_GOOD' && (has('operations') || has('sales') || has('home')) ? (
          <PromisableFigure product={product} />
        ) : purchasable && (has('purchasing') || has('monthlyPlan')) ? (
          <ToBuyFigure product={product} />
        ) : made && has('plant') ? (
          <ToMakeFigure product={product} />
        ) : null}
      </HeaderGrid>
    </DocumentSection>
  );
}

function PromisableFigure({ product }: { product: Product }) {
  const availability = useAvailability();
  const row = availability.data?.rows.find((candidate) => candidate.product.id === product.id);
  return (
    <Figure
      label="Se puede prometer"
      hint={row?.limitingMaterial ? `Lo limita ${row.limitingMaterial.name}` : undefined}
    >
      {row ? <Qty value={row.promisable} emphasis /> : '—'}
    </Figure>
  );
}

function ToBuyFigure({ product }: { product: Product }) {
  const needs = usePurchaseNeeds();
  const row = needs.data?.rows.find((candidate) => candidate.product.id === product.id);
  return (
    <Figure label="Falta comprar" hint="Ya descontado lo que viene en camino">
      {row ? <Qty value={row.toBuy} emphasis dimZero /> : <span className="text-ink-3">0</span>}
    </Figure>
  );
}

function ToMakeFigure({ product }: { product: Product }) {
  const needs = useProductionNeeds();
  const pending =
    product.type === 'BULK'
      ? needs.data?.bulk.find((row) => row.product.id === product.id)?.pendingToSchedule
      : needs.data?.packaging.find((row) => row.product.id === product.id)?.pendingToSchedule;
  return (
    <Figure
      label={product.type === 'BULK' ? 'Falta programar producir' : 'Falta programar envasar'}
    >
      {pending ? <Qty value={pending} emphasis dimZero /> : <span className="text-ink-3">0</span>}
    </Figure>
  );
}

function WhereUsedSection({ product }: { product: Product }) {
  const navigate = useNavigate();
  const users = useWhereUsed(product.id);
  const rows = useMemo(() => users.data ?? [], [users.data]);
  const columns: QueryColumn<WhereUsed>[] = [
    {
      key: 'code',
      header: 'Código',
      sort: (row) => row.code,
      csv: (row) => row.code,
      render: (row) => <span className="tabular-nums">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Producto',
      sort: (row) => row.name,
      csv: (row) => row.name,
      render: (row) => (
        <EntityLink to="product" id={row.id}>
          {row.name}
        </EntityLink>
      ),
    },
    { key: 'type', header: 'Tipo', csv: (row) => row.typeLabel, render: (row) => row.typeLabel },
  ];
  return (
    <GridSection title="Se usa en (fórmulas vigentes)">
      <QueryView query={users}>
        {() => (
          <QueryGrid<WhereUsed>
            title="Se usa en"
            exportName="se-usa-en"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            pageSize={25}
            onOpen={(row) => {
              void navigate(`/productos/${row.id}`);
            }}
            empty="Ninguna fórmula vigente lo usa."
          />
        )}
      </QueryView>
    </GridSection>
  );
}
