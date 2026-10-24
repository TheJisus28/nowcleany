import { type QuantityDto, toQuantityDto } from '../../../shared-kernel/index.js';
import { ORDER_STATUS_LABELS, type OrderStatus, orderLabel } from '../domain/sales-order.js';
import type { OrderRecord } from './sales-orders.repository.js';

export interface SalesOrderView {
  readonly id: string;
  readonly number: string;
  readonly label: string;
  readonly status: OrderStatus;
  readonly statusLabel: string;
  readonly customer: { id: string; name: string; taxId: string | null };
  readonly seller: { id: string; name: string };
  readonly estimatedDeliveryDate: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
  readonly dispatchedAt: string | null;
  readonly dispatchedBy: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
  readonly cancelReason: string | null;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    quantity: QuantityDto;
  }[];
}

export function toOrderView(order: OrderRecord): SalesOrderView {
  return {
    id: order.id,
    number: order.number.toString(),
    label: orderLabel(order.number),
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    customer: order.customer,
    seller: order.seller,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
    dispatchedBy: order.dispatchedByName,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelledBy: order.cancelledByName,
    cancelReason: order.cancelReason,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      productCode: line.productCode,
      productName: line.productName,
      quantity: toQuantityDto(line.quantity, line.unit),
    })),
  };
}
