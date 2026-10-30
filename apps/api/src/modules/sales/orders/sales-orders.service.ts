import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { Actor } from '../../../platform/security/actor.js';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  Quantity,
  toQuantityDto,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { Trail } from '../../audit/index.js';
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
 * Pre-sales and their flow: the seller sends it, the consolidator invoices it (billing), plant prepares
 * it, logistics ships and delivers it (logistics). Each step is authorized by its role and written to
 * the trail in the same transaction. Pre-sales never touch the stock until they are dispatched.
 * A seller sees only their own orders; whoever holds sales-orders:read-all sees everyone's.
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly orders: SalesOrdersRepository,
    private readonly customers: CustomersService,
    private readonly visits: VisitsRepository,
    private readonly catalog: ProductCatalog,
    private readonly inventory: InventoryLedger,
    private readonly trail: Trail,
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

  /** The order's timeline: who did and authorized each step. */
  @Transactional()
  async history(id: string) {
    const order = await this.require(id);
    return this.trail.of('sales_order', [order.id]);
  }

  @Transactional()
  async create(command: OrderCommand): Promise<SalesOrderView> {
    const actor = this.currentActor.require();
    const id = await this.orders.insert(await this.content(command), {
      id: actor.id,
      name: actor.displayName,
    });
    if (command.visitId) await this.linkVisit(command.visitId, command.customerId, id);
    const order = await this.require(id);
    await this.step(
      order,
      'created',
      `Registró la preventa para ${order.customer.name} (${order.branch.name}).`,
    );
    return toOrderView(order);
  }

  @Transactional()
  async update(id: string, command: OrderCommand): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    assertEditable(order.status);
    await this.orders.update(id, await this.content(command));
    return this.get(id);
  }

  /** Sent to the consolidator: it now counts for planning. The stock is not touched. */
  @Transactional()
  async confirm(id: string): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    if (order.status !== 'DRAFT') return toOrderView(order);
    assertTransition(order.status, 'CONFIRMED');
    await this.orders.markConfirmed(id);
    await this.step(order, 'submitted', 'Envió la preventa al consolidado.');
    return this.get(id);
  }

  /**
   * Plant hands over to dispatch what exists of an invoiced order: everything, or (when the consolidator
   * allowed a partial dispatch) part of it. Quantities per product in the product's unit; by default
   * everything still to ship.
   */
  @Transactional()
  async prepare(
    id: string,
    quantities?: readonly { productId: string; quantity: string }[],
    at?: Date,
  ): Promise<SalesOrderView> {
    this.currentActor.requirePermission('sales-orders:prepare');
    const order = await this.require(id);
    assertTransition(order.status, 'READY');
    const ready = new Map<string, bigint>();
    for (const line of order.lines) {
      const pending = line.quantity - line.dispatchedQuantity;
      const asked = quantities?.find((item) => item.productId === line.productId);
      const quantity = asked ? Quantity.parse(asked.quantity, line.unit).base : pending;
      if (quantity < 0n || quantity > pending) {
        throw new ValidationError(
          'sales.invalid_ready_quantity',
          `De ${line.productCode} quedan ${toQuantityDto(pending, line.unit).quantity} por despachar.`,
        );
      }
      ready.set(line.productId, quantity);
    }
    const total = [...ready.values()].reduce((sum, value) => sum + value, 0n);
    if (total === 0n) {
      throw new ValidationError(
        'sales.nothing_ready',
        'Indica qué cantidades se entregan a despacho.',
      );
    }
    const complete = order.lines.every(
      (line) => ready.get(line.productId) === line.quantity - line.dispatchedQuantity,
    );
    if (!complete && !order.allowPartial) {
      throw new ConflictError(
        'sales.partial_not_allowed',
        'Este pedido se despacha completo: el consolidado no autorizó despacho parcial.',
      );
    }
    // What the plant hands over moves from the plant warehouse to dispatch, where the shipment takes it.
    await this.inventory.handOver({
      note: `Alistamiento ${orderLabel(order.number)}`,
      lines: order.lines
        .filter((line) => (ready.get(line.productId) ?? 0n) > 0n)
        .map((line) => ({
          productId: line.productId,
          quantity: toQuantityDto(ready.get(line.productId) ?? 0n, line.unit).quantity,
          unit: line.unit,
        })),
    });
    await this.orders.markReady(
      id,
      order.status,
      ready,
      this.currentActor.require().displayName,
      at,
    );
    await this.step(
      order,
      'prepared',
      complete
        ? 'Alistó el pedido completo y lo entregó a despacho.'
        : `Alistó una parte y la entregó a despacho: ${describe(order, ready)}.`,
      at,
    );
    return this.get(id);
  }

  /** The consolidator decides which invoiced orders get the available stock first. */
  @Transactional()
  async setPriority(id: string, priority: number | null): Promise<SalesOrderView> {
    this.currentActor.requirePermission('invoices:issue');
    const order = await this.require(id);
    await this.orders.setPriority(id, priority);
    await this.step(
      order,
      'prioritized',
      priority === null
        ? 'Quitó la prioridad del pedido.'
        : `Puso el pedido en la prioridad ${String(priority)}.`,
    );
    return this.get(id);
  }

  @Transactional()
  async cancel(id: string, reason: string): Promise<SalesOrderView> {
    const order = await this.require(id);
    this.assertCanManage(order);
    assertTransition(order.status, 'CANCELLED');
    const actor = this.currentActor.require();
    const why = requireCancelReason(reason);
    await this.orders.markCancelled(id, actor.displayName, why);
    await this.step(order, 'cancelled', `Anuló la preventa: ${why}`);
    return this.get(id);
  }

  // --- steps run by other modules (billing, logistics) -----------------------------------------

  /** Billing issued the invoice of a pre-sale sent to the consolidator. */
  async markInvoiced(
    orderId: string,
    invoice: {
      label: string;
      total: string;
      allowPartial: boolean;
      priority: number | null;
      pending: boolean;
    },
    at?: Date,
  ): Promise<void> {
    const order = await this.load(orderId);
    assertTransition(order.status, 'INVOICED');
    await this.orders.markInvoiced(
      orderId,
      this.currentActor.require().displayName,
      { allowPartial: invoice.allowPartial, priority: invoice.priority },
      at,
    );
    const extras = [
      invoice.pending ? 'con producto pendiente por fabricar o comprar' : null,
      invoice.allowPartial ? 'autoriza despacho parcial' : null,
    ].filter(Boolean);
    await this.step(
      order,
      'invoiced',
      `Consolidó y facturó: ${invoice.label} por ${invoice.total}${extras.length ? ` (${extras.join('; ')})` : ''}.`,
      at,
    );
  }

  /** Logistics dispatched what plant handed over, in a guide: the goods leave the dispatch warehouse. */
  async markDispatched(
    orderId: string,
    shipment: { id: string; label: string; detail: string },
    at?: Date,
  ): Promise<{ productId: string; quantity: bigint }[]> {
    const order = await this.load(orderId);
    assertTransition(order.status, 'DISPATCHED');
    const lines = order.lines
      .filter((line) => line.readyQuantity > 0n)
      .map((line) => ({ productId: line.productId, quantity: line.readyQuantity }));
    await this.inventory.dispatch({
      idempotencyKey: `shipment:${shipment.id}:order:${order.id}`,
      orderId: order.id,
      reference: { type: 'sales_order', id: order.id, label: orderLabel(order.number) },
      lines,
    });
    const shipped = new Map(lines.map((line) => [line.productId, line.quantity]));
    const complete = order.lines.every(
      (line) => line.dispatchedQuantity + (shipped.get(line.productId) ?? 0n) >= line.quantity,
    );
    await this.orders.registerDispatch(
      orderId,
      shipped,
      complete ? 'DISPATCHED' : 'PARTIAL',
      this.currentActor.require().displayName,
      at,
    );
    await this.step(
      order,
      'dispatched',
      complete
        ? `Despachó en la guía ${shipment.label} (${shipment.detail}).`
        : `Despachó una parte en la guía ${shipment.label} (${shipment.detail}): ${describe(order, shipped)}.`,
      at,
    );
    return lines;
  }

  /** The customer received a guide's goods; the order ends when the last part is delivered. */
  async noteDelivery(
    orderId: string,
    delivery: { receivedBy: string; shipmentLabel: string; final: boolean },
    at?: Date,
  ): Promise<void> {
    const order = await this.load(orderId);
    if (delivery.final && order.status === 'DISPATCHED') {
      await this.orders.markDelivered(orderId, delivery.receivedBy, at);
    }
    await this.step(
      order,
      'delivered',
      `Confirmó la entrega${delivery.final ? '' : ' parcial'} (${delivery.shipmentLabel}): recibió ${delivery.receivedBy}.`,
      at,
    );
  }

  /** Seeds only: backdates a new order (sales history). */
  async backdate(orderId: string, at: Date): Promise<void> {
    await this.orders.backdate(orderId, at);
  }

  /** Seeds only: a past order shipped and delivered, with its trail, without moving today's stock. */
  async completeHistory(
    orderId: string,
    history: { dispatchedAt: Date; deliveredAt: Date; receivedBy: string; route: string },
  ): Promise<void> {
    const order = await this.load(orderId);
    const byName = this.currentActor.require().displayName;
    await this.orders.completeHistory(orderId, { ...history, byName });
    await this.step(
      order,
      'dispatched',
      `Despachó el pedido (${history.route}).`,
      history.dispatchedAt,
    );
    await this.step(
      order,
      'delivered',
      `Confirmó la entrega: recibió ${history.receivedBy}.`,
      history.deliveredAt,
    );
  }

  /** Any order, without the seller filter (callers check their own permission). */
  async load(id: string): Promise<OrderRecord> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('sales.order_not_found', 'La preventa no existe.');
    return order;
  }

  // --- helpers ---------------------------------------------------------------------------

  private step(order: OrderRecord, action: string, summary: string, at?: Date): Promise<void> {
    return this.trail.record({
      entity: 'sales_order',
      id: order.id,
      label: orderLabel(order.number),
      action,
      summary,
      at,
    });
  }

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

/** "00224 × 300, 00226 × 40" for the trail. */
function describe(order: OrderRecord, quantities: ReadonlyMap<string, bigint>): string {
  return order.lines
    .filter((line) => (quantities.get(line.productId) ?? 0n) > 0n)
    .map(
      (line) =>
        `${line.productCode} × ${toQuantityDto(quantities.get(line.productId) ?? 0n, line.unit).quantity}`,
    )
    .join(', ');
}

function seesAll(actor: Actor): boolean {
  return actor.system || actor.permissions.has('sales-orders:read-all');
}
