import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  NotFoundError,
  parseMoney,
  Quantity,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { Trail } from '../../audit/index.js';
import { ProductCatalog } from '../../product/index.js';
import {
  assertOpen,
  type PurchaseStatus,
  purchaseLabel,
  validatePurchaseLines,
} from '../domain/purchase-order.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import { type PurchaseOrderView, toPurchaseOrderView } from './purchase-order-view.js';
import {
  type PurchaseOrderRecord,
  PurchaseOrdersRepository,
} from './purchase-orders.repository.js';

interface LineInput {
  readonly productId: string;
  readonly quantity: string;
  readonly unit?: string;
  /** Pesos per stock unit; defaults to the product's purchase cost. */
  readonly unitCost?: string;
}

/** Purchasing orders from suppliers; receiving enters the supplier invoices against them. */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly orders: PurchaseOrdersRepository,
    private readonly suppliers: SuppliersService,
    private readonly catalog: ProductCatalog,
    private readonly trail: Trail,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async list(filter: {
    statuses?: PurchaseStatus[];
    productId?: string;
    supplierId?: string;
    limit?: number;
  }): Promise<PurchaseOrderView[]> {
    const orders = await this.orders.list({
      limit: filter.limit ?? 100,
      ...(filter.statuses ? { statuses: filter.statuses } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    });
    return orders.map(toPurchaseOrderView);
  }

  @Transactional()
  async get(id: string): Promise<PurchaseOrderView> {
    return toPurchaseOrderView(await this.require(id));
  }

  @Transactional()
  async create(
    command: {
      supplierId: string;
      expectedDate?: string;
      notes?: string;
      lines: readonly LineInput[];
    },
    /** Seeds backdate history. */
    at?: Date,
  ): Promise<PurchaseOrderView> {
    const products = new Map(
      (await this.catalog.findByIds(command.lines.map((line) => line.productId))).map((p) => [
        p.id,
        p,
      ]),
    );
    const lines = command.lines.map((line) => {
      const product = products.get(line.productId);
      if (!product)
        throw new ValidationError('purchasing.unknown_product', 'Uno de los productos no existe.');
      const unitCost = line.unitCost === undefined ? product.cost : parseMoney(line.unitCost);
      return {
        product,
        quantity: Quantity.parse(line.quantity, line.unit ?? product.stockUnit),
        unitCost: unitCost ?? 0n,
      };
    });
    validatePurchaseLines(lines);
    const actor = this.currentActor.require();
    const supplier = await this.suppliers.requireActive(command.supplierId);
    const id = await this.orders.insert({
      supplier,
      expectedDate: command.expectedDate ?? null,
      notes: command.notes?.trim() ? command.notes.trim() : null,
      createdBy: { id: actor.id, name: actor.displayName },
      createdAt: at,
      lines: lines.map(({ product, quantity, unitCost }) => ({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unit: product.stockUnit,
        quantity: quantity.base,
        unitCost,
      })),
    });
    const order = await this.require(id);
    const view = toPurchaseOrderView(order);
    await this.step(
      order,
      'ordered',
      `Pidió a ${supplier.name}: ${order.lines.map((line) => line.productCode).join(', ')}${
        command.expectedDate ? `, llega el ${command.expectedDate}` : ''
      }.`,
      at,
    );
    return view;
  }

  /** Purchasing closes a partially received order with what came (the rest will not arrive). */
  @Transactional()
  async close(id: string): Promise<PurchaseOrderView> {
    const order = await this.require(id);
    assertOpen(order.status, 'close');
    await this.orders.setStatus(id, 'CLOSED');
    await this.step(order, 'closed', 'Cerró la orden con lo recibido: el resto ya no llegará.');
    return this.get(id);
  }

  @Transactional()
  async cancel(id: string): Promise<PurchaseOrderView> {
    const order = await this.require(id);
    assertOpen(order.status, 'cancel');
    await this.orders.setStatus(id, 'CANCELLED', this.currentActor.require().displayName);
    await this.step(order, 'cancelled', 'Anuló la orden de compra.');
    return this.get(id);
  }

  async require(id: string): Promise<PurchaseOrderRecord> {
    const order = await this.orders.findById(id);
    if (!order)
      throw new NotFoundError('purchasing.order_not_found', 'La orden de compra no existe.');
    return order;
  }

  private step(order: PurchaseOrderRecord, action: string, summary: string, at?: Date) {
    return this.trail.record({
      entity: 'purchase_order',
      id: order.id,
      label: purchaseLabel(order.number),
      action,
      summary,
      at,
    });
  }
}
