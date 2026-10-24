import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { EventPublisher } from '../../../platform/outbox/event-publisher.js';
import type { Actor } from '../../../platform/security/actor.js';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  ForbiddenError,
  NotFoundError,
  Quantity,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { InventoryLedger } from '../../inventory/index.js';
import { ProductCatalog } from '../../product/index.js';
import {
  assertEditable,
  assertTransition,
  type OrderStatus,
  orderLabel,
  parseDeliveryDate,
  requireCancelReason,
  validateLines,
} from '../domain/sales-order.js';
import { CustomersRepository } from '../customers/customers.repository.js';
import { type SalesOrderView, toOrderView } from './order-view.js';
import {
  type OrderContent,
  type OrderRecord,
  SalesOrdersRepository,
} from './sales-orders.repository.js';

export interface OrderCommand {
  readonly customerId: string;
  readonly estimatedDeliveryDate?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly { productId: string; quantity: string; unit?: string }[];
}

const STALE_DRAFT_MS = 30 * 60 * 1000;

@Injectable()
export class SalesOrdersService {
  private readonly logger = new Logger('sales');

  constructor(
    private readonly orders: SalesOrdersRepository,
    private readonly customers: CustomersRepository,
    private readonly catalog: ProductCatalog,
    private readonly inventory: InventoryLedger,
    private readonly events: EventPublisher,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('sales')
  async list(filter: {
    statuses?: OrderStatus[];
    mine?: boolean;
    customerId?: string;
    search?: string;
    limit?: number;
  }): Promise<SalesOrderView[]> {
    const actor = this.currentActor.require();
    const orders = await this.orders.list({
      limit: filter.limit ?? 100,
      ...(filter.statuses ? { statuses: filter.statuses } : {}),
      ...(filter.mine ? { sellerId: actor.id } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.search ? { search: filter.search } : {}),
    });
    return orders.map(toOrderView);
  }

  @Transactional('sales')
  async get(id: string): Promise<SalesOrderView> {
    return toOrderView(await this.require(id));
  }

  @Transactional('sales')
  async create(command: OrderCommand): Promise<SalesOrderView> {
    const actor = this.currentActor.require();
    const id = await this.orders.insert(await this.content(command), {
      id: actor.id,
      name: actor.displayName,
    });
    return this.get(id);
  }

  @Transactional('sales')
  async update(id: string, command: OrderCommand): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    assertEditable(order.status);
    await this.orders.update(id, await this.content(command));
    return this.get(id);
  }

  /**
   * Commits the order's finished goods in inventory (inventory's transaction) and then marks it confirmed
   * (sales' transaction). Never fails for lack of stock. Safe to retry: reserve is idempotent per order,
   * and a draft left half-confirmed gets its reservations released by a worker job after 30 minutes.
   */
  async confirm(id: string): Promise<SalesOrderView> {
    const order = await this.startConfirmation(id);
    if (order.status === 'CONFIRMED') return toOrderView(order);
    await this.inventory.reserve(
      order.id,
      orderLabel(order.number),
      order.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    );
    return this.finishConfirmation(id);
  }

  /** Ships the order from DESPACHO (inventory's transaction, idempotent key) and marks it dispatched. */
  async dispatch(id: string): Promise<SalesOrderView> {
    const order = await this.loadForDispatch(id);
    if (order.status === 'DISPATCHED') return toOrderView(order);
    await this.inventory.dispatch({
      idempotencyKey: `sales-order:${order.id}:dispatch`,
      orderId: order.id,
      reference: { type: 'sales_order', id: order.id, label: orderLabel(order.number) },
      lines: order.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    });
    return this.finishDispatch(id);
  }

  /** Cancels and publishes SalesOrderCancelled in the same transaction; inventory releases the stock. */
  @Transactional('sales')
  async cancel(id: string, reason: string): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    assertTransition(order.status, 'CANCELLED');
    const actor = this.currentActor.require();
    await this.orders.markCancelled(id, actor.displayName, requireCancelReason(reason));
    await this.events.publish('SalesOrderCancelled', {
      orderId: order.id,
      orderLabel: orderLabel(order.number),
    });
    return this.get(id);
  }

  /** Worker job: drafts whose confirmation started 30+ minutes ago and never finished. */
  async releaseStaleDrafts(): Promise<number> {
    const stale = await this.findStaleDrafts(new Date(Date.now() - STALE_DRAFT_MS));
    for (const order of stale) {
      await this.inventory.release(order.id);
      await this.clearConfirmation(order.id);
      this.logger.warn(
        `Reservas liberadas de la preventa ${orderLabel(order.number)} que quedó en borrador`,
      );
    }
    return stale.length;
  }

  // --- single-transaction steps ------------------------------------------------------------

  @Transactional('sales')
  private async startConfirmation(id: string): Promise<OrderRecord> {
    const order = await this.require(id);
    this.assertCanManage(order);
    if (order.status === 'CONFIRMED') return order;
    assertTransition(order.status, 'CONFIRMED');
    await this.orders.markConfirmationStarted(id);
    return order;
  }

  @Transactional('sales')
  private async finishConfirmation(id: string): Promise<SalesOrderView> {
    await this.orders.markConfirmed(id);
    return this.get(id);
  }

  @Transactional('sales')
  private async loadForDispatch(id: string): Promise<OrderRecord> {
    const order = await this.require(id);
    if (order.status !== 'DISPATCHED') assertTransition(order.status, 'DISPATCHED');
    return order;
  }

  @Transactional('sales')
  private async finishDispatch(id: string): Promise<SalesOrderView> {
    await this.orders.markDispatched(id, this.currentActor.require().displayName);
    return this.get(id);
  }

  @Transactional('sales')
  private findStaleDrafts(before: Date) {
    return this.orders.staleDrafts(before);
  }

  @Transactional('sales')
  private clearConfirmation(id: string): Promise<void> {
    return this.orders.clearConfirmationStarted(id);
  }

  // --- helpers ---------------------------------------------------------------------------

  private async content(command: OrderCommand): Promise<OrderContent> {
    if (!(await this.customers.findById(command.customerId))) {
      throw new ValidationError('sales.customer_not_found', 'El cliente no existe.');
    }
    const products = new Map(
      (await this.catalog.findByIds(command.lines.map((line) => line.productId))).map((p) => [
        p.id,
        p,
      ]),
    );
    const lines = command.lines.map((line) => {
      const product = products.get(line.productId);
      if (!product)
        throw new ValidationError('sales.unknown_product', 'Uno de los productos no existe.');
      return { product, quantity: Quantity.parse(line.quantity, line.unit ?? product.stockUnit) };
    });
    validateLines(lines);
    return {
      customerId: command.customerId,
      estimatedDeliveryDate: parseDeliveryDate(command.estimatedDeliveryDate),
      notes: command.notes?.trim() ? command.notes.trim() : null,
      lines: lines.map(({ product, quantity }) => ({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unit: product.stockUnit,
        quantity: quantity.base,
      })),
    };
  }

  /** Sellers manage their own orders; managers (sales-orders:manage-all) any order. */
  private assertCanManage(order: OrderRecord): Actor {
    const actor = this.currentActor.require();
    if (order.seller.id !== actor.id && !actor.permissions.has('sales-orders:manage-all')) {
      throw new ForbiddenError(
        'sales.not_owner',
        `La preventa ${orderLabel(order.number)} la registró ${order.seller.name}; solo quien la registró o gerencia pueden modificarla.`,
      );
    }
    return actor;
  }

  private async require(id: string): Promise<OrderRecord> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('sales.order_not_found', 'La preventa no existe.');
    return order;
  }
}
