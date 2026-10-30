import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  COMMITTED_STATUSES,
  INVOICED_STATUSES,
  type OrderStatus,
  orderLabel,
} from '../domain/sales-order.js';
import { SalesOrdersService } from '../orders/sales-orders.service.js';
import { type OrderRecord, SalesOrdersRepository } from '../orders/sales-orders.repository.js';

export interface OpenOrder {
  readonly id: string;
  readonly label: string;
  readonly status: OrderStatus;
  readonly customerId: string;
  readonly customerName: string;
  readonly seller: { id: string; name: string };
  readonly estimatedDeliveryDate: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly priority: number | null;
  /** Base units of each finished good. */
  readonly lines: readonly { productId: string; quantity: bigint }[];
}

/** An order as other modules need it (billing invoices it, logistics ships it). */
export type SalesOrderRecord = OrderRecord & { readonly label: string };

const withLabel = (order: OrderRecord): SalesOrderRecord => ({
  ...order,
  label: orderLabel(order.number),
});

/**
 * Public API of the sales module: planning reads who sold what and for when; billing and logistics
 * move orders along the flow (each checks its own permission before calling).
 */
@Injectable()
export class SalesDirectory {
  constructor(
    private readonly orders: SalesOrdersRepository,
    private readonly service: SalesOrdersService,
    private readonly currentActor: CurrentActor,
  ) {}

  /** Drafts and orders sold but not shipped, oldest first. */
  @Transactional()
  async openOrders(): Promise<OpenOrder[]> {
    this.currentActor.requirePermission('sales-orders:read');
    const orders = await this.orders.list({
      statuses: ['DRAFT', ...COMMITTED_STATUSES],
      limit: 10_000,
    });
    return orders
      .map((order) => ({
        id: order.id,
        label: orderLabel(order.number),
        status: order.status,
        customerId: order.customer.id,
        customerName: order.customer.name,
        seller: order.seller,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        createdAt: order.createdAt,
        confirmedAt: order.confirmedAt,
        priority: order.priority,
        // What is still to ship (a partial dispatch already took part of it).
        lines: order.lines
          .map((line) => ({
            productId: line.productId,
            quantity: line.quantity - line.dispatchedQuantity,
          }))
          .filter((line) => line.quantity > 0n),
      }))
      .reverse();
  }

  /** Orders in a status (all of them, or the given ids), oldest first. */
  @Transactional()
  async inStatus(status: OrderStatus, ids?: readonly string[]): Promise<SalesOrderRecord[]> {
    const orders = await this.orders.list({ statuses: [status], limit: 2000 });
    return orders
      .filter((order) => !ids || ids.includes(order.id))
      .map(withLabel)
      .reverse();
  }

  async get(id: string): Promise<SalesOrderRecord> {
    return withLabel(await this.service.load(id));
  }

  markInvoiced(
    orderId: string,
    invoice: {
      label: string;
      total: string;
      allowPartial: boolean;
      priority: number | null;
      pending: boolean;
    },
    at?: Date,
  ) {
    return this.service.markInvoiced(orderId, invoice, at);
  }

  markDispatched(
    orderId: string,
    shipment: { id: string; label: string; detail: string },
    at?: Date,
  ) {
    return this.service.markDispatched(orderId, shipment, at);
  }

  noteDelivery(
    orderId: string,
    delivery: { receivedBy: string; shipmentLabel: string; final: boolean },
    at?: Date,
  ) {
    return this.service.noteDelivery(orderId, delivery, at);
  }

  /** Plant hands an order over to dispatch (seeds; the API goes through the controller). */
  prepare(orderId: string, at?: Date) {
    return this.service.prepare(orderId, undefined, at);
  }

  /** What was invoiced of each product in [from, to): the sales history. */
  @Transactional()
  soldBetween(from: Date, to: Date) {
    this.currentActor.requirePermission('planning:read');
    return this.orders.soldBetween(from, to, INVOICED_STATUSES);
  }
}
