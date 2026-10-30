import { Ban, CircleCheckBig, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { PurchaseOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { Qty } from '../../components/qty';
import { Button } from '../../components/ui';
import { isZero } from '../../lib/format';
import { SupplierInvoiceDialog } from './supplier-invoice-dialog';

type Pending = 'cancel' | 'close' | 'invoice' | null;

/**
 * What can be done with a purchase order, by role: purchasing cancels it (nothing received yet) or
 * closes it with what came; receiving enters the supplier's invoice. Clicks do not reach the row.
 */
export function PurchaseOrderActions({
  order,
  size = 'sm',
}: {
  order: PurchaseOrder;
  size?: 'sm' | 'md';
}) {
  const { can } = useSession();
  const [pending, setPending] = useState<Pending>(null);
  const close = () => {
    setPending(null);
  };
  const cancelOrder = useAction(
    () => api.post<PurchaseOrder>(`/v1/purchase-orders/${order.id}/cancel`),
    { success: (result) => `${result.label} anulada` },
  );
  const closeOrder = useAction(
    () => api.post<PurchaseOrder>(`/v1/purchase-orders/${order.id}/close`),
    { success: (result) => `${result.label} cerrada con lo recibido` },
  );

  const canCancel = order.status === 'OPEN' && can('purchasing:write');
  const canClose = order.status === 'PARTIAL' && can('purchasing:write');
  const canInvoice =
    (order.status === 'OPEN' || order.status === 'PARTIAL') && can('purchasing:receive');
  if (!canCancel && !canClose && !canInvoice) return null;
  const icon = size === 'sm' ? 'size-3.5' : 'size-4';

  return (
    <span
      className="inline-flex flex-wrap justify-end gap-2"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {canCancel ? (
        <Button
          size={size}
          variant={size === 'sm' ? 'ghost' : 'danger'}
          icon={<Ban className={icon} />}
          onClick={() => {
            setPending('cancel');
          }}
        >
          Anular
        </Button>
      ) : null}
      {canClose ? (
        <Button
          size={size}
          variant="secondary"
          icon={<CircleCheckBig className={icon} />}
          onClick={() => {
            setPending('close');
          }}
        >
          Cerrar con lo recibido
        </Button>
      ) : null}
      {canInvoice ? (
        <Button
          size={size}
          icon={<ReceiptText className={icon} />}
          onClick={() => {
            setPending('invoice');
          }}
        >
          Ingresar factura
        </Button>
      ) : null}

      {pending === 'invoice' ? <SupplierInvoiceDialog order={order} onClose={close} /> : null}

      <Dialog
        open={pending === 'cancel'}
        onClose={close}
        title={`¿Anular ${order.label}?`}
        description={`${order.supplier.name} no ha entregado nada de esta orden. Al anularla deja de contar como en tránsito y vuelve a aparecer en lo que hay que comprar.`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Volver
            </Button>
            <Button
              variant="danger"
              loading={cancelOrder.isPending}
              onClick={() => {
                cancelOrder.mutate(undefined, { onSuccess: close });
              }}
            >
              Anular orden
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Queda registrado en la traza con tu nombre.</p>
      </Dialog>

      <Dialog
        open={pending === 'close'}
        onClose={close}
        title={`¿Cerrar ${order.label} con lo recibido?`}
        description="El proveedor no enviará el resto: lo pendiente deja de contar como en tránsito."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Volver
            </Button>
            <Button
              loading={closeOrder.isPending}
              onClick={() => {
                closeOrder.mutate(undefined, { onSuccess: close });
              }}
            >
              Cerrar con lo recibido
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm font-medium">Queda sin llegar</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {order.lines
            .filter((line) => !isZero(line.pending.quantity))
            .map((line) => (
              <li key={line.productId} className="flex justify-between gap-4">
                <span className="truncate">{line.productName}</span>
                <Qty value={line.pending} emphasis />
              </li>
            ))}
        </ul>
      </Dialog>
    </span>
  );
}
