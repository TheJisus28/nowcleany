import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
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
import { CustomersService } from '../customers/customers.service.js';
import {
  assertEditable,
  assertTransition,
  type OrderStatus,
  orderLabel,
  parseDeliveryDate,
  requireCancelReason,
  validateLines,
} from '../domain/sales-order.js';
import { VisitsRepository } from '../visits/visits.repository.js';
import { type SalesOrderView, toOrderView } from './order-view.js';
import {
  type OrderContent,
  type OrderRecord,
  SalesOrdersRepository,
} from './sales-orders.repository.js';

export interface OrderCommand {
  readonly customerId: string;
  readonly branchId: string;
  readonly visitId?: string;
  readonly estimatedDeliveryDate?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly { productId: string; quantity: string; unit?: string }[];
}

/**
 * Pre-sales. They never touch the physical stock (planning reads them as a projection); a seller sees
 * only their own, whoever holds sales-orders:read-all sees everyone's.
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly orders: SalesOrdersRepository,
    private readonly customers: CustomersService,
    private readonly visits: VisitsRepository,
    private readonly catalog: ProductCatalog,
    private readonly inventory: InventoryLedger,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async list(filter: {
    statuses?: OrderStatus[];
    mine?: boolean;
    customerId?: string;
    productId?: string;
    search?: string;
    limit?: number;
  }): Promise<SalesOrderView[]> {
    const actor = this.currentActor.require();
    const onlyOwn = filter.mine === true || !seesAll(actor);
    const orders = await this.orders.list({
      limit: filter.limit ?? 100,
      ...(filter.statuses ? { statuses: filter.statuses } : {}),
      ...(onlyOwn ? { sellerId: actor.id } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.search ? { search: filter.search } : {}),
    });
    return orders.map(toOrderView);
  }

  @Transactional()
  async get(id: string): Promise<SalesOrderView> {
    return toOrderView(await this.require(id));
  }

  @Transactional()
  async create(command: OrderCommand): Promise<SalesOrderView> {
    const actor = this.currentActor.require();
    const id = await this.orders.insert(await this.content(command), {
      id: actor.id,
      name: actor.displayName,
    });
    if (command.visitId) await this.linkVisit(command.visitId, command.customerId, id);
    return this.get(id);
  }

  @Transactional()
  async update(id: string, command: OrderCommand): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    assertEditable(order.status);
    await this.orders.update(id, await this.content(command));
    return this.get(id);
  }

  /** Confirmed: it now counts for planning (what to make and buy). The stock is not touched. */
  @Transactional()
  async confirm(id: string): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    if (order.status === 'CONFIRMED') return toOrderView(order);
    assertTransition(order.status, 'CONFIRMED');
    await this.orders.markConfirmed(id);
    return this.get(id);
  }

  /** Ships the order: the real stock leaves the dispatch warehouse. */
  @Transactional()
  async dispatch(id: string): Promise<SalesOrderView> {
    const order = await this.require(id);
    if (order.status === 'DISPATCHED') return toOrderView(order);
    assertTransition(order.status, 'DISPATCHED');
    await this.inventory.dispatch({
      idempotencyKey: `sales-order:${order.id}:dispatch`,
      orderId: order.id,
      reference: { type: 'sales_order', id: order.id, label: orderLabel(order.number) },
      lines: order.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    });
    await this.orders.markDispatched(id, this.currentActor.require().displayName);
    return this.get(id);
  }

  @Transactional()
  async cancel(id: string, reason: string): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    assertTransition(order.status, 'CANCELLED');
    const actor = this.currentActor.require();
    await this.orders.markCancelled(id, actor.displayName, requireCancelReason(reason));
    return this.get(id);
  }

  // --- helpers ---------------------------------------------------------------------------

  private async content(command: OrderCommand): Promise<OrderContent> {
    // Only customers in the seller's portfolio (or any, with customers:read-all).
    await this.customers.requireVisible(command.customerId);
    const branch = await this.customers.requireBranch(command.customerId, command.branchId);
    if (!branch.active) {
      throw new ValidationError('sales.inactive_branch', 'La sucursal está desactivada.');
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
      branchId: branch.id,
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

  private async linkVisit(visitId: string, customerId: string, orderId: string): Promise<void> {
    const visit = await this.visits.findById(visitId);
    const actor = this.currentActor.require();
    if (visit?.sellerId !== actor.id || visit.customerId !== customerId) {
      throw new ValidationError('sales.invalid_visit', 'La visita no corresponde a este cliente.');
    }
    await this.visits.setOrder(visitId, orderId);
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
    const actor = this.currentActor.require();
    if (!order || (!seesAll(actor) && order.seller.id !== actor.id)) {
      throw new NotFoundError('sales.order_not_found', 'La preventa no existe.');
    }
    return order;
  }
}

function seesAll(actor: Actor): boolean {
  return actor.system || actor.permissions.has('sales-orders:read-all');
}
