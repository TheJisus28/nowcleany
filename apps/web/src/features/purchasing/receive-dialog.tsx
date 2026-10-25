import { PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { PurchaseOrder } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Button, Field, Input } from '../../components/ui';
import { formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';

/** Warehouse records what actually arrived (it may be less than ordered). */
export function ReceiveDialog({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const [document, setDocument] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.lines.map((line) => [line.productId, formatDecimal(line.quantity.quantity)]),
    ),
  );
  const parsed = Object.fromEntries(
    Object.entries(quantities).map(([productId, value]) => [productId, parseDecimalInput(value)]),
  );
  const valid = Object.values(parsed).every((value) => value !== null);

  const receive = useAction(
    () =>
      api.post<PurchaseOrder>(`/v1/purchase-orders/${order.id}/receive`, {
        ...(document.trim() ? { document: document.trim() } : {}),
        lines: order.lines.map((line) => ({
          productId: line.productId,
          quantity: parsed[line.productId] ?? '0',
        })),
      }),
    { success: (result) => `${result.label} recibida: existencias actualizadas` },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Recibir ${order.label}`}
      description={`${order.supplier}. Corrige las cantidades si llegó menos de lo pedido.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<PackageCheck className="size-4" />}
            loading={receive.isPending}
            disabled={!valid}
            onClick={() => {
              receive.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Registrar recepción
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {order.lines.map((line) => (
          <li key={line.productId}>
            <Field
              label={`${line.productName} (${unitLabel(line.quantity.unit)})`}
              hint={`Pedido: ${formatDecimal(line.quantity.quantity)} ${unitLabel(line.quantity.unit)}`}
              error={parsed[line.productId] === null ? 'Escribe una cantidad válida.' : undefined}
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
          </li>
        ))}
      </ul>
      <Field label="Factura o remisión del proveedor (opcional)" className="mt-5">
        {(props) => (
          <Input
            {...props}
            value={document}
            onChange={(event) => {
              setDocument(event.target.value);
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
