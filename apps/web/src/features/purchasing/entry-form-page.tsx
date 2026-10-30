import { Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, usePurchaseOrder, usePurchaseOrders } from '../../api/hooks';
import type { PurchaseOrder, SupplierInvoice } from '../../api/types';
import { useProfile } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  type LookupItem,
  LookupField,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { cn } from '../../components/ui';
import {
  formatCop,
  formatDate,
  formatDecimal,
  isZero,
  parseDecimalInput,
  roundUpDecimal,
  todayIso,
  unitLabel,
} from '../../lib/format';
import { compareDecimals } from '../plant/decimal';
import { DateCell, DocumentNotice, GRID_HEAD, GRID_TD, GRID_TH, INPUT } from '../inventory/erp-kit';
import { amountOf, moneyInput, parseMoneyInput, vatOf } from './money';

interface Form {
  documentNumber: string;
  invoiceDate: string;
  quantities: Record<string, string>;
  costs: Record<string, string>;
}

/** What is still pending at the agreed cost: the default content of an entry. */
const blankFor = (order: PurchaseOrder): Form => ({
  documentNumber: '',
  invoiceDate: todayIso(),
  quantities: Object.fromEntries(
    order.lines.map((line) => [
      line.productId,
      isZero(line.pending.quantity) ? '0' : formatDecimal(line.pending.quantity),
    ]),
  ),
  costs: Object.fromEntries(order.lines.map((line) => [line.productId, moneyInput(line.unitCost)])),
});

const CELL =
  'h-8 w-full rounded-[4px] border border-line-strong bg-surface px-2 text-right text-[13.5px] tabular-nums focus:border-brand aria-invalid:border-critical';

/**
 * The warehouse entry: the purchase order (F2 among open orders), the supplier's invoice number and
 * date, and what arrived per line (prefilled with what is pending, at the order's cost). Saving brings
 * the goods into the stock and leaves the invoice in accounts payable.
 */
export function EntryFormPage() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('orden') ?? '';
  const open = usePurchaseOrders('OPEN,PARTIAL');
  const order = usePurchaseOrder(orderId || undefined);
  const items = useMemo<LookupItem[]>(
    () =>
      (open.data ?? []).map((item) => ({
        id: item.id,
        code: item.label,
        label: item.supplier.name,
        detail: item.expectedDate ? `esperada ${formatDate(item.expectedDate)}` : 'sin fecha',
      })),
    [open.data],
  );
  useWorkTab(order.data ? `Entrada · ${order.data.label}` : 'Nueva entrada de almacén');

  const pick = (id: string) => {
    setParams(id ? { orden: id } : {}, { replace: true });
  };

  return order.data && (order.data.status === 'OPEN' || order.data.status === 'PARTIAL') ? (
    <EntryDocument key={order.data.id} order={order.data} items={items} onPick={pick} />
  ) : (
    <EntryDocument
      key="empty"
      order={null}
      items={items}
      onPick={pick}
      {...(order.data
        ? {
            closedLabel: `${order.data.label} está ${order.data.statusLabel.toLowerCase()}: ya no recibe entradas.`,
          }
        : {})}
      {...(orderId && order.isPending ? { loading: true } : {})}
    />
  );
}

function EntryDocument({
  order,
  items,
  onPick,
  closedLabel,
  loading = false,
}: {
  order: PurchaseOrder | null;
  items: LookupItem[];
  onPick: (id: string) => void;
  closedLabel?: string;
  loading?: boolean;
}) {
  const navigate = useNavigate();
  const profile = useProfile();
  const [form, setForm] = useState<Form>(() =>
    order
      ? blankFor(order)
      : { documentNumber: '', invoiceDate: todayIso(), quantities: {}, costs: {} },
  );
  const [touched, setTouched] = useState(false);
  const draft = useDraft(`supplier-entry.${order?.id ?? 'none'}`, form, {
    enabled: Boolean(order),
    isEmpty: (value) => !value.documentNumber,
  });
  useEffect(() => {
    if (order) document.getElementById('entry-document')?.focus();
  }, [order]);

  const rows = (order?.lines ?? []).map((line) => {
    const rawQuantity = form.quantities[line.productId] ?? '';
    const rawCost = form.costs[line.productId] ?? '';
    const quantity = rawQuantity.trim() === '' ? '0' : parseDecimalInput(rawQuantity);
    const cost = rawCost.trim() === '' ? line.unitCost : parseMoneyInput(rawCost);
    const over = quantity !== null && compareDecimals(quantity, line.pending.quantity) > 0;
    return { line, quantity, cost, over, amount: amountOf(quantity, cost) };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.amount, 0n);
  const tax = vatOf(subtotal);
  const arriving = rows.filter(
    (row) => row.quantity !== null && compareDecimals(row.quantity, '0') > 0,
  );
  const errors = {
    order: order ? undefined : 'Elige la orden de compra (F2 para buscar).',
    documentNumber: form.documentNumber.trim()
      ? undefined
      : 'Escribe el número de la factura del proveedor.',
    invoiceDate: form.invoiceDate ? undefined : 'Indica la fecha de la factura.',
    lines: rows.some((row) => row.quantity === null || row.cost === null)
      ? 'Revisa las cantidades y costos marcados.'
      : order && arriving.length === 0
        ? 'Indica lo que llegó con esta factura.'
        : undefined,
  };
  const valid = Object.values(errors).every((error) => !error);
  const show = (message: string | undefined) =>
    touched && message ? (
      <span className="mt-1 block text-[12px] text-critical">{message}</span>
    ) : null;

  const register = useAction(
    () =>
      api.post<SupplierInvoice>(`/v1/purchase-orders/${order?.id ?? ''}/supplier-invoices`, {
        documentNumber: form.documentNumber.trim(),
        invoiceDate: form.invoiceDate,
        lines: arriving.map((row) => ({
          productId: row.line.productId,
          quantity: row.quantity ?? '0',
          ...(row.cost ? { unitCost: row.cost } : {}),
        })),
      }),
    {
      success: (invoice) =>
        `Entrada con factura ${invoice.documentNumber} registrada: la mercancía ya está en el inventario`,
    },
  );
  const save = () => {
    setTouched(true);
    if (!valid || !order || register.isPending) return;
    register.mutate(undefined, {
      onSuccess: () => {
        draft.clear();
        void navigate(`/compras/ordenes/${order.id}`, { replace: true });
      },
    });
  };
  const setLine = (field: 'quantities' | 'costs', productId: string, value: string) => {
    setForm((current) => ({ ...current, [field]: { ...current[field], [productId]: value } }));
  };

  return (
    <>
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setForm(restored);
          }}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind="Entrada de almacén"
        number="Nueva"
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Guardar',
                icon: Save,
                shortcut: 'Ctrl+S',
                primary: true,
                loading: register.isPending,
                disabled: !order,
                onClick: save,
              },
            ]}
            closeTo="/recepcion"
          />
        }
        notes={
          <span className="text-[12.5px] text-ink-3">
            Si llegó menos de lo pedido, la orden queda recibida parcial y puede recibir otra
            entrada. El valor final lo calcula el sistema al guardar; la factura queda en cuentas
            por pagar a 30 días.
          </span>
        }
        totals={[
          { label: 'Subtotal', value: formatCop(subtotal.toString()) },
          { label: 'IVA 19 %', value: formatCop(tax.toString()) },
          {
            label: 'Total de la factura',
            value: formatCop((subtotal + tax).toString()),
            strong: true,
          },
        ]}
        signatures={[{ label: 'Recibió', name: profile.fullName, at: formatDate(todayIso()) }]}
      >
        {closedLabel ? <DocumentNotice>{closedLabel}</DocumentNotice> : null}
        <HeaderGrid>
          <HeaderField label="Orden de compra" span={2} htmlFor="entry-order">
            <LookupField
              id="entry-order"
              title="Buscar orden de compra abierta"
              items={items}
              value={order?.id ?? null}
              placeholder="OC-…"
              onChange={onPick}
            />
            {loading ? (
              <span className="mt-1 block text-[12px] text-ink-3">Cargando la orden…</span>
            ) : (
              show(errors.order)
            )}
          </HeaderField>
          <HeaderField label="Proveedor" span={2}>
            {order ? (
              <span className="font-medium">{order.supplier.name}</span>
            ) : (
              <span className="text-ink-3">Se completa con la orden</span>
            )}
          </HeaderField>
          <HeaderField label="Factura del proveedor No." htmlFor="entry-document">
            <input
              id="entry-document"
              className={cn(INPUT, 'uppercase')}
              value={form.documentNumber}
              maxLength={40}
              placeholder="FE-4587"
              disabled={!order}
              aria-invalid={touched && errors.documentNumber ? true : undefined}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  documentNumber: event.target.value.toUpperCase(),
                }));
              }}
              onBlur={() => {
                if (form.documentNumber) setTouched(true);
              }}
            />
            {show(order ? errors.documentNumber : undefined)}
          </HeaderField>
          <HeaderField label="Fecha de la factura" htmlFor="entry-date">
            <input
              id="entry-date"
              type="date"
              className={INPUT}
              value={form.invoiceDate}
              max={todayIso()}
              disabled={!order}
              onChange={(event) => {
                setForm((current) => ({ ...current, invoiceDate: event.target.value }));
              }}
            />
            {show(order ? errors.invoiceDate : undefined)}
          </HeaderField>
          <HeaderField label="Fecha esperada de la orden">
            {order ? (
              <DateCell date={order.expectedDate} pending lateLabel="Atrasada" />
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </HeaderField>
          <HeaderField label="Bodega">Planta</HeaderField>
        </HeaderGrid>

        <DocumentSection title="Lo que llegó" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                  <th className={cn(GRID_TH, 'w-24')}>Código</th>
                  <th className={GRID_TH}>Descripción</th>
                  <th className={cn(GRID_TH, 'w-12')}>Und</th>
                  <th className={cn(GRID_TH, 'text-right')}>Pedido</th>
                  <th className={cn(GRID_TH, 'text-right')}>Recibido antes</th>
                  <th className={cn(GRID_TH, 'text-right')}>Pendiente</th>
                  <th className={cn(GRID_TH, 'w-28 text-right')}>Llegó</th>
                  <th className={cn(GRID_TH, 'w-32 text-right')}>Costo unit.</th>
                  <th className={cn(GRID_TH, 'w-32 pr-5 text-right')}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {!order ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-ink-3">
                      Elige la orden de compra para traer lo pendiente.
                    </td>
                  </tr>
                ) : (
                  rows.map(({ line, quantity, cost, over, amount }, index) => {
                    const done = isZero(line.pending.quantity);
                    return (
                      <tr
                        key={line.productId}
                        className={cn(
                          'border-b border-line',
                          touched && (quantity === null || cost === null) && 'bg-critical-soft/40',
                        )}
                      >
                        <td className={cn(GRID_TD, 'text-center text-ink-3 tabular-nums')}>
                          {index + 1}
                        </td>
                        <td className={cn(GRID_TD, 'tabular-nums')}>{line.productCode}</td>
                        <td className={GRID_TD}>
                          <EntityLink to="product" id={line.productId}>
                            {line.productName}
                          </EntityLink>
                          {over ? (
                            <span className="block text-[12px] text-[#9a6a00]">
                              Llega más de lo pendiente.
                            </span>
                          ) : done ? (
                            <span className="block text-[12px] text-ink-3">Ya llegó completo.</span>
                          ) : null}
                        </td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>
                          {unitLabel(line.quantity.unit)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                          {formatDecimal(roundUpDecimal(line.quantity.quantity))}
                        </td>
                        <td className={cn(GRID_TD, 'text-right text-ink-2 tabular-nums')}>
                          {formatDecimal(roundUpDecimal(line.received.quantity))}
                        </td>
                        <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                          {done ? '—' : formatDecimal(roundUpDecimal(line.pending.quantity))}
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            className={cn(CELL, 'font-semibold')}
                            inputMode="decimal"
                            value={form.quantities[line.productId] ?? ''}
                            aria-label={`Cantidad que llegó de ${line.productCode}`}
                            aria-invalid={quantity === null ? true : undefined}
                            onChange={(event) => {
                              setLine('quantities', line.productId, event.target.value);
                            }}
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            className={CELL}
                            inputMode="numeric"
                            value={form.costs[line.productId] ?? ''}
                            aria-label={`Costo unitario de ${line.productCode}`}
                            aria-invalid={cost === null ? true : undefined}
                            onChange={(event) => {
                              setLine('costs', line.productId, event.target.value);
                            }}
                          />
                        </td>
                        <td className={cn(GRID_TD, 'pr-5 text-right font-medium tabular-nums')}>
                          {amount > 0n ? formatCop(amount.toString()) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {show(order ? errors.lines : undefined) ? (
            <p className="px-5 py-2">{show(errors.lines)}</p>
          ) : null}
        </DocumentSection>
      </DocumentScreen>
    </>
  );
}
