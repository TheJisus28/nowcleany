import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useProducts, useSuppliers } from '../../api/hooks';
import type { PurchaseOrder } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Button, Field, Input, Select, Textarea } from '../../components/ui';
import { formatCop, parseDecimalInput, todayIso, unitLabel } from '../../lib/format';
import { amountOf, moneyInput, parseMoneyInput } from './money';

export interface PurchaseDraftLine {
  productId: string;
  /** As shown in the field ("1.200"). */
  quantity: string;
  /** Pesos per stock unit as shown in the field ("2.400"); "" uses the product's cost. */
  unitCost: string;
}

interface LineState extends PurchaseDraftLine {
  key: number;
}

let nextKey = 1;

const PURCHASABLE = new Set(['RAW_MATERIAL', 'RESALE']);

/**
 * A purchase order to one supplier: raw materials and resale goods, each with its quantity and the
 * agreed unit cost (prefilled with the product's cost). It counts as in transit as soon as it exists.
 */
export function PurchaseOrderDialog({
  initial,
  onClose,
  onCreated,
  description = 'Lo pedido cuenta como en tránsito en cuanto se crea la orden.',
}: {
  initial: PurchaseDraftLine[];
  onClose: () => void;
  onCreated?: (order: PurchaseOrder) => void;
  description?: string;
}) {
  const products = useProducts({ active: true });
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(todayIso(3));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>(() =>
    (initial.length > 0 ? initial : [{ productId: '', quantity: '', unitCost: '' }]).map(
      (line) => ({ ...line, key: nextKey++ }),
    ),
  );

  const purchasable = useMemo(
    () => (products.data ?? []).filter((product) => PURCHASABLE.has(product.type)),
    [products.data],
  );
  const byId = useMemo(() => new Map(purchasable.map((p) => [p.id, p])), [purchasable]);

  const parsed = lines.map((line) => {
    const quantity = parseDecimalInput(line.quantity);
    const fallback = byId.get(line.productId)?.cost ?? null;
    const cost = line.unitCost.trim() === '' ? fallback : parseMoneyInput(line.unitCost);
    return {
      line,
      quantity,
      cost,
      costInvalid: line.unitCost.trim() !== '' && cost === null,
      amount: amountOf(quantity, cost),
    };
  });
  const total = parsed.reduce((sum, row) => sum + row.amount, 0n);
  const repeated = new Set(
    lines.map((line) => line.productId).filter((id, index, all) => id && all.indexOf(id) !== index),
  );
  const valid =
    Boolean(supplierId) &&
    parsed.length > 0 &&
    repeated.size === 0 &&
    parsed.every((row) => row.line.productId && Number(row.quantity ?? 0) > 0 && !row.costInvalid);

  const update = (key: number, patch: Partial<PurchaseDraftLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const create = useAction(
    () =>
      api.post<PurchaseOrder>('/v1/purchase-orders', {
        supplierId,
        ...(expectedDate ? { expectedDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: parsed.map((row) => ({
          productId: row.line.productId,
          quantity: row.quantity ?? '0',
          ...(row.cost ? { unitCost: row.cost } : {}),
        })),
      }),
    { success: (order) => `${order.label} creada: ya cuenta como en tránsito` },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Nueva orden de compra"
      description={description}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-ink-2">
            Total antes de IVA{' '}
            <strong className="ml-1 text-base text-ink tabular-nums">
              {formatCop(total.toString())}
            </strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<ShoppingCart className="size-4" />}
            loading={create.isPending}
            disabled={!valid}
            onClick={() => {
              create.mutate(undefined, {
                onSuccess: (order) => {
                  onCreated?.(order);
                  onClose();
                },
              });
            }}
          >
            Crear orden de compra
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Proveedor" hint="Los proveedores se administran en Compras › Proveedores.">
          {(props) => (
            <Select
              {...props}
              value={supplierId}
              autoFocus
              onChange={(event) => {
                setSupplierId(event.target.value);
              }}
            >
              <option value="">Elige un proveedor…</option>
              {(suppliers.data ?? [])
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.city ? ` (${item.city})` : ''}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Fecha esperada de llegada">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={expectedDate}
              onChange={(event) => {
                setExpectedDate(event.target.value);
              }}
            />
          )}
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Productos</h3>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => {
              setLines((current) => [
                ...current,
                { key: nextKey++, productId: '', quantity: '', unitCost: '' },
              ]);
            }}
          >
            Agregar
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {parsed.map(({ line, amount, costInvalid }, index) => {
            const product = byId.get(line.productId);
            const unit = product ? unitLabel(product.stockUnit) : '';
            return (
              <li
                key={line.key}
                className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-end"
              >
                <Field
                  label={`Producto ${String(index + 1)}`}
                  error={
                    repeated.has(line.productId) ? 'Ya está en otra línea de la orden.' : undefined
                  }
                >
                  {(props) => (
                    <Select
                      {...props}
                      value={line.productId}
                      onChange={(event) => {
                        update(line.key, { productId: event.target.value });
                      }}
                    >
                      <option value="">Elige…</option>
                      {purchasable.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.code} · {option.name}
                          {option.type === 'RESALE' ? ' (reventa)' : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={`Cantidad${unit ? ` (${unit})` : ''}`}>
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => {
                        update(line.key, { quantity: event.target.value });
                      }}
                    />
                  )}
                </Field>
                <Field
                  label={`Costo${unit ? ` por ${unit}` : ' unitario'}`}
                  error={costInvalid ? 'Pesos enteros.' : undefined}
                >
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="numeric"
                      value={line.unitCost}
                      placeholder={moneyInput(product?.cost) || '0'}
                      onChange={(event) => {
                        update(line.key, { unitCost: event.target.value });
                      }}
                    />
                  )}
                </Field>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="text-sm text-ink-2 tabular-nums sm:hidden">
                    {formatCop(amount.toString())}
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={`Quitar producto ${String(index + 1)}`}
                    icon={<Trash2 className="size-4" />}
                    disabled={lines.length === 1}
                    onClick={() => {
                      setLines((current) => current.filter((l) => l.key !== line.key));
                    }}
                  />
                </div>
                {amount > 0n ? (
                  <p className="hidden text-right text-[12.5px] text-ink-3 tabular-nums sm:col-span-4 sm:block">
                    Valor de la línea: {formatCop(amount.toString())}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <Field label="Notas (opcional)" className="mt-6">
        {(props) => (
          <Textarea
            {...props}
            value={notes}
            maxLength={500}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
