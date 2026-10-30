import { amountFor, type QuantityDto, toQuantityDto } from '../../../shared-kernel/index.js';
import {
  PURCHASE_STATUS_LABELS,
  type PurchaseStatus,
  purchaseLabel,
} from '../domain/purchase-order.js';
import type { PurchaseOrderRecord } from './purchase-orders.repository.js';

export interface PurchaseOrderView {
  readonly id: string;
  readonly label: string;
  readonly supplier: { id: string; name: string };
  readonly expectedDate: string | null;
  readonly status: PurchaseStatus;
  readonly statusLabel: string;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly receivedAt: string | null;
  readonly cancelledAt: string | null;
  /** Pesos before VAT, as an integer string. */
  readonly total: string;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    quantity: QuantityDto;
    received: QuantityDto;
    pending: QuantityDto;
    unitCost: string;
    amount: string;
  }[];
}

export function toPurchaseOrderView(order: PurchaseOrderRecord): PurchaseOrderView {
  const lines = order.lines.map((line) => {
    const pending = line.quantity - line.receivedQuantity;
    return {
      productId: line.productId,
      productCode: line.productCode,
      productName: line.productName,
      quantity: toQuantityDto(line.quantity, line.unit),
      received: toQuantityDto(line.receivedQuantity, line.unit),
      pending: toQuantityDto(pending > 0n ? pending : 0n, line.unit),
      unitCost: line.unitCost.toString(),
      amount: amountFor(line.quantity, line.unitCost, line.unit).toString(),
    };
  });
  return {
    id: order.id,
    label: purchaseLabel(order.number),
    supplier: order.supplier,
    expectedDate: order.expectedDate,
    status: order.status,
    statusLabel: PURCHASE_STATUS_LABELS[order.status],
    notes: order.notes,
    createdBy: order.createdBy.name,
    createdAt: order.createdAt.toISOString(),
    receivedAt: order.receivedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    total: lines.reduce((sum, line) => sum + BigInt(line.amount), 0n).toString(),
    lines,
  };
}
