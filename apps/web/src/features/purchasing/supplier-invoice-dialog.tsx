import { ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { PurchaseOrder, SupplierInvoice } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Qty } from '../../components/qty';
import { Button, Field, Input } from '../../components/ui';
import {
  formatCop,
  formatDecimal,
  isZero,
  parseDecimalInput,
  todayIso,
  unitLabel,
} from '../../lib/format';
import { amountOf, moneyInput, parseMoneyInput, vatOf } from './money';

/**
 * Receiving enters the supplier's invoice against its purchase order: what arrived (prefilled with
 * what is still pending) at the billed cost (prefilled with the agreed one). With it, the goods enter
 * the stock. An order may receive several invoices.
 */
export function SupplierInvoiceDialog({
  order,
  onClose,
}: {
  order: PurchaseOrder;
  onClose: () => void;
}) {
  const [documentNumber, setDocumentNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.lines.map((line) => [
        line.productId,
        isZero(line.pending.quantity) ? '0' : formatDecimal(line.pending.quantity),
      ]),
    ),
  );
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.lines.map((line) => [line.productId, moneyInput(line.unitCost)])),
  );

  const rows = order.lines.map((line) => {
    const rawQuantity = quantities[line.productId] ?? '';
    const rawCost = costs[line.productId] ?? '';
    const quantity = rawQuantity.trim() === '' ? '0' : parseDecimalInput(rawQuantity);
    const cost = rawCost.trim() === '' ? line.unitCost : parseMoneyInput(rawCost);
    return { line, quantity, cost, amount: amountOf(quantity, cost) };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.amount, 0n);
  const tax = vatOf(subtotal);
  const arriving = rows.filter((row) => row.quantity !== null && Number(row.quantity) > 0);
  const valid =
    documentNumber.trim().length > 0 &&
    Boolean(invoiceDate) &&
    rows.every((row) => row.quantity !== null && row.cost !== null) &&
    arriving.length > 0;

  const register = useAction(
    () =>
      api.post<SupplierInvoice>(`/v1/purchase-orders/${order.id}/supplier-invoices`, {
        documentNumber: documentNumber.trim(),
        invoiceDate,
        lines: arriving.map((row) => ({
          productId: row.line.productId,
          quantity: row.quantity ?? '0',
          ...(row.cost ? { unitCost: row.cost } : {}),
        })),
      }),
    {
      success: (invoice) =>
        `Factura ${invoice.documentNumber} ingresada: la mercancía ya está en el inventario`,
    },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Ingresar factura del proveedor · ${order.label}`}
      description={`${order.supplier.name}. Escribe lo que llegó con esta factura; si llegó menos, la orden queda recibida parcial.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<ReceiptText className="size-4" />}
            loading={register.isPending}
            disabled={!valid}
            onClick={() => {
              register.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Ingresar factura y mercancía
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Número de la factura" hint="Como aparece en el documento: FE-4587.">
          {(props) => (
            <Input
              {...props}
              value={documentNumber}
              autoFocus
              maxLength={40}
              placeholder="FE-4587"
              onChange={(event) => {
                setDocumentNumber(event.target.value.toUpperCase());
              }}
            />
          )}
        </Field>
        <Field label="Fecha de la factura">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={invoiceDate}
              max={todayIso()}
              onChange={(event) => {
                setInvoiceDate(event.target.value);
              }}
            />
          )}
        </Field>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold">Lo que llegó</h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {rows.map(({ line, quantity, cost, amount }) => {
          const unit = unitLabel(line.quantity.unit);
          const done = isZero(line.pending.quantity);
          return (
            <li
              key={line.productId}
              className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_120px_130px] sm:items-start"
            >
              <div className="min-w-0">
                <p className="font-medium">{line.productName}</p>
                <p className="text-[12.5px] text-ink-3">
                  {line.productCode} · pedido <Qty value={line.quantity} /> · recibido{' '}
                  <Qty value={line.received} dimZero />
                </p>
                <p className="mt-1 text-[12.5px]">
                  {done ? (
                    <span className="text-ink-3">Ya llegó completo</span>
                  ) : (
                    <>
                      Pendiente <Qty value={line.pending} emphasis />
                    </>
                  )}
                  {amount > 0n ? (
                    <span className="ml-2 text-ink-2 tabular-nums">
                      · {formatCop(amount.toString())}
                    </span>
                  ) : null}
                </p>
              </div>
              <Field
                label={`Llegó (${unit})`}
                error={quantity === null ? 'Cantidad no válida.' : undefined}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={quantities[line.productId] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setQuantities((current) => ({ ...current, [line.productId]: value }));
                    }}
                  />
                )}
              </Field>
              <Field
                label={`Costo por ${unit}`}
                error={cost === null ? 'Pesos enteros.' : undefined}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="numeric"
                    value={costs[line.productId] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCosts((current) => ({ ...current, [line.productId]: value }));
                    }}
                  />
                )}
              </Field>
            </li>
          );
        })}
      </ul>

      <dl className="mt-5 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
        <dt className="text-ink-2">Subtotal</dt>
        <dd className="text-right">{formatCop(subtotal.toString())}</dd>
        <dt className="text-ink-2">IVA 19 %</dt>
        <dd className="text-right">{formatCop(tax.toString())}</dd>
        <dt className="border-t border-line pt-1.5 font-semibold">Total de la factura</dt>
        <dd className="border-t border-line pt-1.5 text-right text-base font-semibold">
          {formatCop((subtotal + tax).toString())}
        </dd>
      </dl>
      <p className="mt-2 text-right text-[12.5px] text-ink-3">
        El cálculo final lo hace el sistema al guardar; el contable la paga a 30 días.
      </p>
    </Dialog>
  );
}
