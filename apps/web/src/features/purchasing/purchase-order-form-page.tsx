import { Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useProducts, usePurchaseNeeds, useSuppliers } from '../../api/hooks';
import type { PurchaseOrder } from '../../api/types';
import { useProfile } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  LineGrid,
  type LineProduct,
  type LineRow,
  linesTotal,
  type LookupItem,
  LookupField,
  newLine,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import {
  formatCop,
  formatDate,
  formatDecimal,
  parseDecimalInput,
  roundUpDecimal,
  todayIso,
  unitLabel,
} from '../../lib/format';
import { INPUT, TEXTAREA } from '../inventory/erp-kit';
import { vatOf } from './money';

interface Form {
  supplierId: string;
  expectedDate: string;
  notes: string;
  rows: LineRow[];
}

const PURCHASABLE = new Set(['RAW_MATERIAL', 'RESALE']);

/** Lines passed by a consultation: "?productos=id:cantidad:costo,…". */
function linesFromParams(raw: string | null): LineRow[] {
  const rows = (raw ?? '')
    .split(',')
    .filter(Boolean)
    .map((item) => {
      const [productId = '', quantity = '', cost = ''] = item.split(':');
      return newLine({
        productId,
        quantity: quantity ? formatDecimal(roundUpDecimal(quantity)) : '',
        price: /^\d+$/.test(cost) ? cost : '',
      });
    })
    .filter((row) => row.productId);
  return [...rows, newLine()];
}

/**
 * The purchase order as one document: supplier (F2) and dates in the header, raw materials and resale
 * goods in the grid with the agreed cost (prefilled with the catalog cost), VAT and total at the bottom.
 */
export function PurchaseOrderFormPage() {
  useWorkTab('Nueva orden de compra');
  const navigate = useNavigate();
  const profile = useProfile();
  const [params] = useSearchParams();
  const products = useProducts({ active: true });
  const suppliers = useSuppliers();
  const needs = usePurchaseNeeds();
  const [form, setForm] = useState<Form>(() => ({
    supplierId: params.get('proveedor') ?? '',
    expectedDate: todayIso(3),
    notes: '',
    rows: linesFromParams(params.get('productos')),
  }));
  const [touched, setTouched] = useState(false);
  const draft = useDraft('purchase-order.new', form, {
    isEmpty: (value) =>
      !value.supplierId && !value.rows.some((row) => row.productId) && !value.notes,
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const lineProducts = useMemo<LineProduct[]>(
    () =>
      (products.data ?? [])
        .filter((product) => PURCHASABLE.has(product.type))
        .map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          unit: product.stockUnit,
          price: product.cost,
        })),
    [products.data],
  );
  const supplierItems = useMemo<LookupItem[]>(
    () =>
      (suppliers.data ?? [])
        .filter((supplier) => supplier.active)
        .map((supplier) => ({
          id: supplier.id,
          code: supplier.documentNumber ?? supplier.name.slice(0, 12).toUpperCase(),
          label: supplier.name,
          ...(supplier.city ? { detail: supplier.city } : {}),
        })),
    [suppliers.data],
  );
  const supplier = suppliers.data?.find((item) => item.id === form.supplierId);
  const toBuy = useMemo(
    () => new Map((needs.data?.rows ?? []).map((row) => [row.product.id, row.toBuy])),
    [needs.data],
  );

  const lines = form.rows.filter((row) => row.productId);
  const rowErrors: Record<number, string | undefined> = {};
  for (const row of lines) {
    const quantity = parseDecimalInput(row.quantity);
    if (quantity === null || Number(quantity) <= 0)
      rowErrors[row.key] = 'Escribe la cantidad a pedir.';
    else if (lines.filter((other) => other.productId === row.productId).length > 1)
      rowErrors[row.key] = 'El producto ya está en otra línea de la orden.';
  }
  const supplierError = form.supplierId ? undefined : 'Elige el proveedor (F2 para buscar).';
  const linesError = lines.length === 0 ? 'Agrega al menos un producto.' : undefined;
  const valid = !supplierError && !linesError && lines.every((row) => !rowErrors[row.key]);
  const subtotal = BigInt(linesTotal(lines));
  const tax = vatOf(subtotal);

  const create = useAction(
    () =>
      api.post<PurchaseOrder>('/v1/purchase-orders', {
        supplierId: form.supplierId,
        ...(form.expectedDate ? { expectedDate: form.expectedDate } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        lines: lines.map((row) => ({
          productId: row.productId,
          quantity: parseDecimalInput(row.quantity) ?? '0',
          ...(row.price ? { unitCost: row.price } : {}),
        })),
      }),
    { success: (order) => `${order.label} guardada: ya cuenta como en tránsito` },
  );
  const save = () => {
    setTouched(true);
    if (!valid || create.isPending) return;
    create.mutate(undefined, {
      onSuccess: (order) => {
        draft.clear();
        void navigate(`/compras/ordenes/${order.id}`, { replace: true });
      },
    });
  };

  return (
    <>
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) {
              setForm({
                ...restored,
                rows: restored.rows.map((row) =>
                  newLine({ productId: row.productId, quantity: row.quantity, price: row.price }),
                ),
              });
            }
          }}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind="Orden de compra"
        number="Nueva"
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Guardar',
                icon: Save,
                shortcut: 'Ctrl+S',
                primary: true,
                loading: create.isPending,
                onClick: save,
              },
            ]}
            closeTo="/compras"
          />
        }
        notes={
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">
              Observaciones para el proveedor
            </span>
            <textarea
              className={TEXTAREA}
              value={form.notes}
              maxLength={500}
              placeholder="Condiciones, lugar de entrega, persona que recibe…"
              onChange={(event) => {
                set('notes', event.target.value);
              }}
            />
          </label>
        }
        totals={[
          { label: 'Subtotal', value: formatCop(subtotal.toString()) },
          { label: 'IVA 19 %', value: formatCop(tax.toString()) },
          { label: 'Total', value: formatCop((subtotal + tax).toString()), strong: true },
        ]}
        signatures={[{ label: 'Elaboró', name: profile.fullName, at: formatDate(todayIso()) }]}
      >
        <HeaderGrid>
          <HeaderField label="Proveedor" span={2} htmlFor="oc-supplier">
            <LookupField
              id="oc-supplier"
              title="Buscar proveedor"
              items={supplierItems}
              value={form.supplierId || null}
              placeholder="Buscar proveedor por NIT o nombre"
              onChange={(id) => {
                set('supplierId', id);
              }}
            />
            {touched && supplierError ? (
              <span className="mt-1 block text-[12px] text-critical">{supplierError}</span>
            ) : null}
          </HeaderField>
          <HeaderField label="Fecha">{formatDate(todayIso())}</HeaderField>
          <HeaderField label="Fecha esperada de llegada" htmlFor="oc-expected">
            <input
              id="oc-expected"
              type="date"
              className={INPUT}
              value={form.expectedDate}
              min={todayIso()}
              onChange={(event) => {
                set('expectedDate', event.target.value);
              }}
            />
          </HeaderField>
          <HeaderField label="Contacto">
            {supplier ? (
              [supplier.contact, supplier.phone].filter(Boolean).join(' · ') || (
                <span className="text-ink-3">Sin contacto</span>
              )
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </HeaderField>
          <HeaderField label="Ciudad">
            {supplier?.city ?? <span className="text-ink-3">—</span>}
          </HeaderField>
          <HeaderField label="Correo">
            {supplier?.email ?? <span className="text-ink-3">—</span>}
          </HeaderField>
          <HeaderField label="Bodega de entrega">Planta</HeaderField>
        </HeaderGrid>

        <DocumentSection title="Productos" flush>
          {touched && linesError ? (
            <p className="px-5 pb-2 text-[12.5px] text-critical">{linesError}</p>
          ) : null}
          <LineGrid
            products={lineProducts}
            rows={form.rows}
            onChange={(rows) => {
              set('rows', rows);
            }}
            price="editable"
            priceLabel="Costo unit."
            extraLabel="Falta para lo vendido"
            extra={(_row, product) => {
              if (!product) return null;
              const missing = toBuy.get(product.id);
              return missing && Number(missing.quantity) > 0 ? (
                <span className="text-critical">
                  {formatDecimal(roundUpDecimal(missing.quantity))} {unitLabel(missing.unit)}
                </span>
              ) : (
                <span className="text-ink-3">—</span>
              );
            }}
            errors={touched ? rowErrors : {}}
          />
        </DocumentSection>
      </DocumentScreen>
    </>
  );
}
