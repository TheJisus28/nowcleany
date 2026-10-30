import { useQueryClient } from '@tanstack/react-query';
import { FilePlus2, PackageSearch, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../../api/client';
import { useProducts, useStockStatus, useWarehouses } from '../../api/hooks';
import type { ProductType } from '../../api/types';
import { useProfile, useSession } from '../../auth/session';
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
  newLine,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import { useToast } from '../../components/toast';
import { cn } from '../../components/ui';
import {
  formatDate,
  formatDecimal,
  parseDecimalInput,
  plural,
  todayIso,
  unitLabel,
} from '../../lib/format';
import { addDecimals, ConfirmDialog, DocumentNotice, INPUT, QtyTotal, SELECT } from './erp-kit';

type DocType = 'ADJUSTMENT' | 'TRANSFER' | 'WASTE' | 'RECEIPT';

interface DocKind {
  label: string;
  permission: string;
  types: readonly ProductType[] | null;
  quantityLabel: string;
  reasonLabel: string;
  reasonRequired: boolean;
  movementType: string;
}

const KINDS: Record<DocType, DocKind> = {
  ADJUSTMENT: {
    label: 'Ajuste por conteo físico',
    permission: 'inventory:adjust',
    types: null,
    quantityLabel: 'Cantidad contada',
    reasonLabel: 'Motivo del ajuste',
    reasonRequired: true,
    movementType: 'ADJUSTMENT',
  },
  TRANSFER: {
    label: 'Traslado Planta → Despacho',
    permission: 'inventory:transfer',
    types: ['FINISHED_GOOD', 'RESALE'],
    quantityLabel: 'Cantidad',
    reasonLabel: 'Detalle (opcional)',
    reasonRequired: false,
    movementType: 'TRANSFER_IN',
  },
  WASTE: {
    label: 'Merma',
    permission: 'inventory:waste',
    types: null,
    quantityLabel: 'Cantidad perdida',
    reasonLabel: 'Causa de la merma (opcional)',
    reasonRequired: false,
    movementType: 'WASTE',
  },
  RECEIPT: {
    label: 'Entrada sin orden de compra',
    permission: 'inventory:receive',
    types: ['RAW_MATERIAL', 'RESALE'],
    quantityLabel: 'Cantidad',
    reasonLabel: 'Nota (opcional)',
    reasonRequired: false,
    movementType: 'RECEIPT',
  },
};

interface Form {
  type: DocType;
  warehouse: string;
  reason: string;
  document: string;
  rows: LineRow[];
}

const filled = (row: LineRow) => Boolean(row.productId);

/**
 * Inventory documents (adjustment by count, transfer to dispatch, waste, goods in without an order) in
 * one screen: type, warehouse and reason in the header, products in the grid. Each line becomes a
 * movement in the kardex with the user's name.
 */
export function InventoryDocsPage() {
  useWorkTab('Ajustes, traslados y mermas');
  const { can } = useSession();
  const profile = useProfile();
  const toast = useToast();
  const client = useQueryClient();
  const products = useProducts({ active: true });
  const warehouses = useWarehouses();
  const stock = useStockStatus();
  const allowed = (Object.keys(KINDS) as DocType[]).filter((type) => can(KINDS[type].permission));
  const [form, setForm] = useState<Form>(() => ({
    type: allowed[0] ?? 'ADJUSTMENT',
    warehouse: 'PLANTA',
    reason: '',
    document: '',
    rows: [newLine()],
  }));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({});
  const [last, setLast] = useState<{ label: string; lines: number; movementType: string } | null>(
    null,
  );
  const draft = useDraft('inventory-doc.new', form, {
    isEmpty: (value) => !value.rows.some(filled) && !value.reason,
  });
  const kind = KINDS[form.type];
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const lineProducts = useMemo<LineProduct[]>(
    () =>
      (products.data ?? [])
        .filter((product) => !kind.types || kind.types.includes(product.type))
        .map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          unit: product.stockUnit,
        })),
    [products.data, kind.types],
  );
  const allowedIds = useMemo(
    () => new Set(lineProducts.map((product) => product.id)),
    [lineProducts],
  );
  const balances = useMemo(
    () =>
      new Map(
        (stock.data ?? []).map((row) => [
          row.productId,
          new Map(row.byWarehouse.map((warehouse) => [warehouse.warehouseCode, warehouse.onHand])),
        ]),
      ),
    [stock.data],
  );
  const warehouse = form.type === 'TRANSFER' ? 'PLANTA' : form.warehouse;
  const balanceOf = (productId: string) => balances.get(productId)?.get(warehouse);

  const lines = form.rows.filter(filled);
  const parsed = lines.map((row) => ({ row, quantity: parseDecimalInput(row.quantity) }));
  const rowErrors: Record<number, string | undefined> = {};
  for (const { row, quantity } of parsed) {
    if (!allowedIds.has(row.productId))
      rowErrors[row.key] = 'Este producto no aplica a este tipo de documento.';
    else if (quantity === null) rowErrors[row.key] = 'Escribe la cantidad.';
    else if (form.type !== 'ADJUSTMENT' && Number(quantity) <= 0)
      rowErrors[row.key] = 'La cantidad debe ser mayor que cero.';
    else if (lines.filter((other) => other.productId === row.productId).length > 1)
      rowErrors[row.key] = 'El producto está repetido en otra línea.';
    else if (serverErrors[row.key]) rowErrors[row.key] = serverErrors[row.key];
  }
  const reasonError =
    kind.reasonRequired && form.reason.trim().length < 5
      ? 'Escribe el motivo (mínimo 5 caracteres): queda en la auditoría.'
      : undefined;
  const valid =
    lines.length > 0 &&
    !reasonError &&
    parsed.every(({ row }) => !rowErrors[row.key] || serverErrors[row.key]);

  const send = async (row: LineRow, quantity: string) => {
    const note = form.reason.trim();
    if (form.type === 'ADJUSTMENT') {
      await api.post('/v1/inventory/adjustments', {
        productId: row.productId,
        warehouse,
        countedQuantity: quantity,
        reason: note,
      });
    } else if (form.type === 'TRANSFER') {
      await api.post('/v1/inventory/transfers', {
        productId: row.productId,
        quantity,
        from: 'PLANTA',
        to: 'DESPACHO',
        ...(note ? { note } : {}),
      });
    } else {
      await api.post('/v1/inventory/waste', {
        productId: row.productId,
        quantity,
        warehouse,
        ...(note ? { note } : {}),
      });
    }
  };

  const save = async () => {
    setConfirming(false);
    setSaving(true);
    const failed: LineRow[] = [];
    const errors: Record<number, string> = {};
    let done = 0;
    if (form.type === 'RECEIPT') {
      try {
        await api.post('/v1/inventory/receipts', {
          warehouse,
          ...(form.document.trim() ? { document: form.document.trim() } : {}),
          ...(form.reason.trim() ? { note: form.reason.trim() } : {}),
          lines: parsed.map(({ row, quantity }) => ({
            productId: row.productId,
            quantity: quantity ?? '0',
          })),
        });
        done = parsed.length;
      } catch (error) {
        toast.show({ tone: 'error', message: errorMessage(error) });
        failed.push(...lines);
      }
    } else {
      // The API takes one product per operation: one movement per line, in order.
      for (const { row, quantity } of parsed) {
        try {
          await send(row, quantity ?? '0');
          done += 1;
        } catch (error) {
          failed.push(row);
          errors[row.key] = errorMessage(error);
        }
      }
    }
    await client.invalidateQueries();
    setSaving(false);
    if (done > 0) {
      toast.show({
        tone: 'success',
        message: `${kind.label}: ${plural(done, 'línea registrada', 'líneas registradas')} en el kárdex`,
      });
      setLast({ label: kind.label, lines: done, movementType: kind.movementType });
    }
    if (failed.length === 0) {
      draft.clear();
      setTouched(false);
      setServerErrors({});
      setForm((current) => ({ ...current, reason: '', document: '', rows: [newLine()] }));
    } else {
      if (Object.keys(errors).length > 0) {
        toast.show({
          tone: 'error',
          message: `${plural(failed.length, 'línea no se registró', 'líneas no se registraron')}: revisa el detalle.`,
        });
      }
      setServerErrors(errors);
      setForm((current) => ({ ...current, rows: failed }));
    }
  };

  const totals = parsed.map(({ row, quantity }) => ({
    quantity: quantity ?? '0',
    unit: lineProducts.find((product) => product.id === row.productId)?.unit ?? 'un',
  }));

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
        kind={kind.label}
        number="Nuevo"
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Guardar',
                icon: Save,
                shortcut: 'Ctrl+S',
                primary: true,
                loading: saving,
                disabled: allowed.length === 0,
                onClick: () => {
                  setTouched(true);
                  if (valid && !saving) setConfirming(true);
                },
              },
              {
                label: 'Nuevo documento',
                icon: FilePlus2,
                onClick: () => {
                  draft.clear();
                  setTouched(false);
                  setServerErrors({});
                  setForm((current) => ({
                    ...current,
                    reason: '',
                    document: '',
                    rows: [newLine()],
                  }));
                },
              },
              { label: 'Kárdex', icon: PackageSearch, to: '/inventario/kardex' },
            ]}
            closeTo="/inventario"
          />
        }
        notes={
          <span className="text-[12.5px] text-ink-3">
            {form.type === 'ADJUSTMENT'
              ? 'El saldo de la bodega queda igual a lo contado; la diferencia se registra con tu nombre y el motivo.'
              : form.type === 'TRANSFER'
                ? 'Sale de la bodega de planta y entra a la de despacho: así queda listo para la guía de despacho.'
                : form.type === 'WASTE'
                  ? 'Lo perdido sale del inventario: granel sobrante, producto dañado o derramado.'
                  : 'Mercancía que entra sin orden de compra. Lo pedido a proveedores entra con la entrada de almacén.'}{' '}
            El kárdex no se borra: un error se corrige con otro ajuste.
          </span>
        }
        totals={[
          { label: 'Líneas', value: lines.length },
          {
            label: form.type === 'ADJUSTMENT' ? 'Total contado' : 'Total',
            value: <QtyTotal values={totals} />,
            strong: true,
          },
        ]}
        signatures={[{ label: 'Elaboró', name: profile.fullName, at: formatDate(todayIso()) }]}
      >
        {allowed.length === 0 ? (
          <DocumentNotice tone="critical">
            Tu rol no tiene permiso para registrar ajustes, traslados ni mermas.
          </DocumentNotice>
        ) : last ? (
          <DocumentNotice tone="info">
            Se registró: {last.label}, {plural(last.lines, 'línea', 'líneas')}.{' '}
            <Link
              to={`/inventario/kardex?tipo=${last.movementType}&desde=${todayIso()}`}
              className="font-medium text-brand underline underline-offset-2"
            >
              Ver en el kárdex
            </Link>
          </DocumentNotice>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Tipo de documento" htmlFor="doc-type">
            <select
              id="doc-type"
              className={cn(SELECT, 'w-full')}
              value={form.type}
              onChange={(event) => {
                const type = event.target.value as DocType;
                setServerErrors({});
                setForm((current) => ({
                  ...current,
                  type,
                  warehouse: type === 'TRANSFER' ? 'PLANTA' : current.warehouse,
                }));
              }}
            >
              {allowed.map((type) => (
                <option key={type} value={type}>
                  {KINDS[type].label}
                </option>
              ))}
            </select>
          </HeaderField>
          <HeaderField label="Bodega" htmlFor="doc-warehouse">
            {form.type === 'TRANSFER' ? (
              <span className="font-medium">Planta → Despacho</span>
            ) : (
              <select
                id="doc-warehouse"
                className={cn(SELECT, 'w-full')}
                value={form.warehouse}
                onChange={(event) => {
                  set('warehouse', event.target.value);
                }}
              >
                {(warehouses.data ?? [{ id: 'PLANTA', code: 'PLANTA', name: 'Planta' }]).map(
                  (item) => (
                    <option key={item.id} value={item.code}>
                      {item.name}
                    </option>
                  ),
                )}
              </select>
            )}
          </HeaderField>
          <HeaderField label="Fecha">{formatDate(todayIso())}</HeaderField>
          <HeaderField label="Elaboró">{profile.fullName}</HeaderField>
          {form.type === 'RECEIPT' ? (
            <HeaderField label="Factura o remisión del proveedor" htmlFor="doc-document">
              <input
                id="doc-document"
                className={INPUT}
                value={form.document}
                maxLength={80}
                onChange={(event) => {
                  set('document', event.target.value.toUpperCase());
                }}
              />
            </HeaderField>
          ) : null}
          <HeaderField
            label={kind.reasonLabel}
            span={form.type === 'RECEIPT' ? 3 : 4}
            htmlFor="doc-reason"
          >
            <input
              id="doc-reason"
              className={INPUT}
              value={form.reason}
              maxLength={300}
              aria-invalid={touched && reasonError ? true : undefined}
              placeholder={
                form.type === 'ADJUSTMENT'
                  ? 'Conteo físico del 30 de octubre'
                  : form.type === 'WASTE'
                    ? 'Sobrante del tanque 2 después de envasar'
                    : ''
              }
              onChange={(event) => {
                set('reason', event.target.value);
              }}
              onBlur={() => {
                if (form.reason) setTouched(true);
              }}
            />
            {touched && reasonError ? (
              <span className="mt-1 block text-[12px] text-critical">{reasonError}</span>
            ) : null}
          </HeaderField>
        </HeaderGrid>

        <DocumentSection title="Productos" flush>
          <LineGrid
            products={lineProducts}
            rows={form.rows}
            onChange={(rows) => {
              set('rows', rows);
            }}
            quantityLabel={kind.quantityLabel}
            extraLabel={form.type === 'ADJUSTMENT' ? 'En bodega · diferencia' : 'En bodega'}
            extra={(row, product) => {
              if (!product) return null;
              const current = balanceOf(product.id) ?? { quantity: '0', unit: product.unit };
              const counted = form.type === 'ADJUSTMENT' ? parseDecimalInput(row.quantity) : null;
              const difference = counted
                ? addDecimals(counted, `-${current.quantity}`.replace('--', ''))
                : null;
              return (
                <span className="whitespace-nowrap">
                  {formatDecimal(current.quantity)} {unitLabel(product.unit)}
                  {difference !== null ? (
                    <span className={difference.startsWith('-') ? 'text-critical' : 'text-good'}>
                      {' '}
                      · {difference.startsWith('-') ? '' : '+'}
                      {formatDecimal(difference)}
                    </span>
                  ) : null}
                </span>
              );
            }}
            errors={touched ? rowErrors : serverErrors}
          />
        </DocumentSection>
      </DocumentScreen>

      <ConfirmDialog
        open={confirming}
        title={`¿Registrar ${kind.label.toLowerCase()}?`}
        description={`Se ${lines.length === 1 ? 'registra 1 movimiento' : `registran ${String(lines.length)} movimientos`} en el kárdex con tu nombre${form.type === 'TRANSFER' ? '' : ` en la bodega ${warehouse === 'PLANTA' ? 'Planta' : 'Despacho'}`}. No se pueden borrar: un error se corrige con otro ajuste.`}
        confirmLabel="Registrar"
        loading={saving}
        onClose={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          void save();
        }}
      >
        <table className="w-full text-[13.5px]">
          <tbody>
            {parsed.map(({ row, quantity }) => {
              const product = lineProducts.find((item) => item.id === row.productId);
              return (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3 text-ink-3 tabular-nums">{product?.code}</td>
                  <td className="py-1.5 pr-3">{product?.name}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {formatDecimal(quantity ?? '0')} {product ? unitLabel(product.unit) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ConfirmDialog>
    </>
  );
}
