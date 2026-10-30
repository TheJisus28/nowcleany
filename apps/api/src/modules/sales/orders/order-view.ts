import { type QuantityDto, toQuantityDto } from '../../../shared-kernel/index.js';
import {
  NEXT_STEP,
  ORDER_STATUS_LABELS,
  type OrderStatus,
  orderLabel,
} from '../domain/sales-order.js';
import type { OrderRecord } from './sales-orders.repository.js';

export interface SalesOrderView {
  readonly id: string;
  readonly number: string;
  readonly label: string;
  readonly status: OrderStatus;
  readonly statusLabel: string;
  /** Who must act next ("Planta debe alistarla…"); null when the flow ended. */
  readonly nextStep: string | null;
  readonly customer: OrderRecord['customer'];
  readonly branch: OrderRecord['branch'];
  readonly seller: { id: string; name: string };
  readonly estimatedDeliveryDate: string | null;
  readonly notes: string | null;
  /** Consolidator's order to share the stock among invoices (lower first). */
  readonly priority: number | null;
  readonly allowPartial: boolean;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
  readonly invoicedAt: string | null;
  readonly invoicedBy: string | null;
  readonly readyAt: string | null;
  readonly readyBy: string | null;
  readonly dispatchedAt: string | null;
  readonly dispatchedBy: string | null;
  readonly deliveredAt: string | null;
  readonly receivedBy: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
  readonly cancelReason: string | null;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    quantity: QuantityDto;
    ready: QuantityDto;
    dispatched: QuantityDto;
    /** Still to ship. */
    pending: QuantityDto;
  }[];
}

export function toOrderView(order: OrderRecord): SalesOrderView {
  return {
    id: order.id,
    number: order.number.toString(),
    label: orderLabel(order.number),
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    nextStep: NEXT_STEP[order.status],
    customer: order.customer,
    branch: order.branch,
    seller: order.seller,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    notes: order.notes,
    priority: order.priority,
    allowPartial: order.allowPartial,
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    invoicedAt: order.invoicedAt?.toISOString() ?? null,
    invoicedBy: order.invoicedByName,
    readyAt: order.readyAt?.toISOString() ?? null,
    readyBy: order.readyByName,
    dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
    dispatchedBy: order.dispatchedByName,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    receivedBy: order.receivedBy,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelledBy: order.cancelledByName,
    cancelReason: order.cancelReason,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      productCode: line.productCode,
      productName: line.productName,
      quantity: toQuantityDto(line.quantity, line.unit),
      ready: toQuantityDto(line.readyQuantity, line.unit),
      dispatched: toQuantityDto(line.dispatchedQuantity, line.unit),
      pending: toQuantityDto(line.quantity - line.dispatchedQuantity, line.unit),
    })),
  };
}
