import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { AWAITING_STATUSES, purchaseLabel } from '../domain/purchase-order.js';
import { PurchaseOrdersRepository } from '../orders/purchase-orders.repository.js';
import { PurchasePlansService } from '../plan/purchase-plans.service.js';
import { SupplierInvoicesService } from '../receipts/supplier-invoices.service.js';

export interface OnOrderLine {
  readonly orderId: string;
  readonly label: string;
  readonly supplier: string;
  readonly expectedDate: string | null;
  readonly productId: string;
  /** Base units still to arrive. */
  readonly quantity: bigint;
}

/** Public read API of the purchasing module (planning, finance). */
@Injectable()
export class PurchasingBook {
  constructor(
    private readonly orders: PurchaseOrdersRepository,
    private readonly plans: PurchasePlansService,
    private readonly supplierInvoices: SupplierInvoicesService,
    private readonly currentActor: CurrentActor,
  ) {}

  /** What is already on its way: ordered and not received yet (planning reads it for everyone). */
  @Transactional()
  async onOrder(): Promise<OnOrderLine[]> {
    this.currentActor.requirePermission('planning:read');
    const orders = await this.orders.list({ statuses: AWAITING_STATUSES, limit: 10_000 });
    return orders.flatMap((order) =>
      order.lines
        .filter((line) => line.quantity > line.receivedQuantity)
        .map((line) => ({
          orderId: order.id,
          label: purchaseLabel(order.number),
          supplier: order.supplier.name,
          expectedDate: order.expectedDate,
          productId: line.productId,
          quantity: line.quantity - line.receivedQuantity,
        })),
    );
  }

  /** Purchasing's saved plan for a month ("2026-11"), base units per product. */
  plan(month: string) {
    return this.plans.forMonth(month);
  }

  /** Supplier invoices and payments (finance reports). */
  payables(filter: { from?: string; to?: string }) {
    this.currentActor.requirePermission('finance:read');
    return this.supplierInvoices.ledger(filter);
  }
}
