import { Truck } from 'lucide-react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Q, Shipment } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Qty } from '../../components/qty';
import { Button } from '../../components/ui';
import { Plate } from './plate';

/** Total per product carried by a guide (what leaves the dispatch warehouse). */
export function shipmentTotals(shipment: Shipment): { id: string; name: string; quantity: Q }[] {
  const totals = new Map<string, { id: string; name: string; quantity: Q }>();
  for (const order of shipment.orders) {
    for (const line of order.lines) {
      const current = totals.get(line.productId);
      if (current) {
        current.quantity = {
          unit: current.quantity.unit,
          quantity: addDecimals(current.quantity.quantity, line.quantity.quantity),
        };
      } else {
        totals.set(line.productId, {
          id: line.productId,
          name: line.productName,
          quantity: { ...line.quantity },
        });
      }
    }
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Exact sum of two non-negative decimal strings ("1.5" + "2.25" = "3.75"). */
function addDecimals(a: string, b: string): string {
  const scale = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0);
  const toInt = (value: string) => {
    const [integer = '0', fraction = ''] = value.split('.');
    return BigInt(`${integer}${fraction.padEnd(scale, '0')}`);
  };
  const sum = (toInt(a) + toInt(b)).toString().padStart(scale + 1, '0');
  if (scale === 0) return sum;
  const fraction = sum.slice(-scale).replace(/0+$/, '');
  return `${sum.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`;
}

/** The vehicle leaves: confirm, because the goods leave the stock at this moment. */
export function DispatchDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const dispatch = useAction(() => api.post<Shipment>(`/v1/shipments/${shipment.id}/dispatch`), {
    success: (result) => `${result.label} despachada: el vehículo va en ruta`,
  });
  const totals = shipmentTotals(shipment);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`¿Despachar ${shipment.label}?`}
      description="Confirma que el vehículo sale ahora: el producto sale de la bodega de despacho y los pedidos quedan en ruta. Queda en la auditoría con tu nombre."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<Truck className="size-4" />}
            loading={dispatch.isPending}
            onClick={() => {
              dispatch.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Despachar ahora
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Plate plate={shipment.vehiclePlate} />
        <span>
          {shipment.carrier} · {shipment.driverName}
        </span>
      </div>
      <p className="mb-2 text-sm font-medium">
        Sale de bodega ({shipment.orders.length}{' '}
        {shipment.orders.length === 1 ? 'pedido' : 'pedidos'})
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-sm">
        {totals.map((total) => (
          <li key={total.id} className="flex justify-between gap-4 px-3 py-2">
            <span className="truncate">{total.name}</span>
            <Qty value={total.quantity} emphasis />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
