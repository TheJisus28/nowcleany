import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { orderLabel } from '../domain/sales-order.js';
import { SalesOrdersRepository } from '../orders/sales-orders.repository.js';

export interface OpenOrder {
  readonly id: string;
  readonly label: string;
  readonly status: 'DRAFT' | 'CONFIRMED';
  readonly customerId: string;
  readonly customerName: string;
  readonly seller: { id: string; name: string };
  readonly estimatedDeliveryDate: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  /** Base units of each finished good. */
  readonly lines: readonly { productId: string; quantity: bigint }[];
}

/** Public read API of the sales module (planning: who sold what, for when). */
@Injectable()
export class SalesDirectory {
  constructor(
    private readonly orders: SalesOrdersRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  /** Drafts and confirmed orders not yet dispatched, oldest first. */
  @Transactional()
  async openOrders(): Promise<OpenOrder[]> {
    this.currentActor.requirePermission('sales-orders:read');
    const orders = await this.orders.list({ statuses: ['DRAFT', 'CONFIRMED'], limit: 10_000 });
    return orders
      .map((order) => ({
        id: order.id,
        label: orderLabel(order.number),
        status: order.status as 'DRAFT' | 'CONFIRMED',
        customerId: order.customer.id,
        customerName: order.customer.name,
        seller: order.seller,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        createdAt: order.createdAt,
        confirmedAt: order.confirmedAt,
        lines: order.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      }))
      .reverse();
  }
}
