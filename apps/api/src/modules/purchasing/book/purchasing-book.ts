import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { purchaseLabel } from '../domain/purchase-order.js';
import { PurchaseOrdersRepository } from '../orders/purchase-orders.repository.js';

export interface OnOrderLine {
  readonly orderId: string;
  readonly label: string;
  readonly supplier: string;
  readonly expectedDate: string | null;
  readonly productId: string;
  /** Base units still to arrive. */
  readonly quantity: bigint;
}

/** Public read API of the purchasing module (planning: what is already on its way). */
@Injectable()
export class PurchasingBook {
  constructor(
    private readonly orders: PurchaseOrdersRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('purchasing')
  async onOrder(): Promise<OnOrderLine[]> {
    this.currentActor.requirePermission('purchasing:read');
    const orders = await this.orders.list({ statuses: ['OPEN'], limit: 10_000 });
    return orders.flatMap((order) =>
      order.lines.map((line) => ({
        orderId: order.id,
        label: purchaseLabel(order.number),
        supplier: order.supplier,
        expectedDate: order.expectedDate,
        productId: line.productId,
        quantity: line.quantity,
      })),
    );
  }
}
