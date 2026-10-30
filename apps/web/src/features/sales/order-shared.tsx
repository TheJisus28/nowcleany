import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useOrders } from '../../api/hooks';
import type { OrderStatus, Q, SalesOrder } from '../../api/types';
import { Field, Textarea } from '../../components/ui';
import { formatDecimal, isZero, roundUpDecimal } from '../../lib/format';
import { ConfirmDialog } from '../billing/erp-kit';

/** Confirmed and not shipped yet: they hold product and show coverage. */
export const COMMITTED: readonly OrderStatus[] = ['CONFIRMED', 'INVOICED', 'READY', 'PARTIAL'];

/** Still moving through the flow (not delivered, not cancelled). */
export const IN_PROGRESS: readonly OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'INVOICED',
  'READY',
  'PARTIAL',
  'DISPATCHED',
];

/** The order statuses as the filter strip shows them. */
export const ORDER_STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'open', label: 'En curso' },
  { value: 'DRAFT', label: 'Borrador (preventa)' },
  { value: 'CONFIRMED', label: 'Por facturar' },
  { value: 'INVOICED', label: 'Facturado' },
  { value: 'READY', label: 'Listo para despacho' },
  { value: 'PARTIAL', label: 'Despachado parcial' },
  { value: 'DISPATCHED', label: 'En ruta' },
  { value: 'DELIVERED', label: 'Entregado' },
  { value: 'CANCELLED', label: 'Anulado' },
  { value: 'all', label: 'Todos' },
];

/** Status filter value → statuses for the API (undefined = all). */
export function statusesFor(value: string): string | undefined {
  if (value === 'all') return undefined;
  if (value === 'open') return IN_PROGRESS.join(',');
  return value;
}

/** Previous / next order by consecutive number among the ones the user can see. */
export function useOrderNeighbors(order: { id: string; number: string } | undefined) {
  const orders = useOrders({ limit: '500' });
  return useMemo(() => {
    if (!order || !orders.data) return { previous: null, next: null };
    const current = Number(order.number);
    let previous: SalesOrder | null = null;
    let next: SalesOrder | null = null;
    for (const item of orders.data) {
      const number = Number(item.number);
      if (number < current && (!previous || number > Number(previous.number))) previous = item;
      if (number > current && (!next || number < Number(next.number))) next = item;
    }
    return {
      previous: previous ? `/ventas/${previous.id}` : null,
      next: next ? `/ventas/${next.id}` : null,
    };
  }, [order, orders.data]);
}

/** A quantity without its unit (the grid has a unit column), muted when zero. */
export function Num({ value, strong = false }: { value: Q; strong?: boolean }) {
  const zero = isZero(value.quantity);
  return (
    <span
      className={
        zero ? 'text-ink-3 tabular-nums' : strong ? 'font-semibold tabular-nums' : 'tabular-nums'
      }
    >
      {formatDecimal(roundUpDecimal(value.quantity))}
    </span>
  );
}

/** "Anular pedido": asks for the reason and says what happens (double confirmation). */
export function CancelOrderDialog({
  order,
  open,
  onClose,
}: {
  order: Pick<SalesOrder, 'id' | 'label' | 'status'>;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const cancel = useAction(
    () => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/cancel`, { reason: reason.trim() }),
    { success: `${order.label} anulado: deja de comprometer producto` },
  );
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      danger
      title={`Anular el pedido ${order.label}`}
      description={
        order.status === 'DRAFT'
          ? 'La preventa queda anulada. Esta acción no se puede deshacer.'
          : 'El pedido deja de comprometer producto y sale de la lista de facturación, de planta y de compras. Esta acción no se puede deshacer.'
      }
      confirmLabel="Sí, anular el pedido"
      loading={cancel.isPending}
      disabled={reason.trim().length < 3}
      onConfirm={() => {
        cancel.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <Field label="Motivo de la anulación (queda en la auditoría)">
        {(props) => (
          <Textarea
            {...props}
            value={reason}
            maxLength={300}
            autoFocus
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}
