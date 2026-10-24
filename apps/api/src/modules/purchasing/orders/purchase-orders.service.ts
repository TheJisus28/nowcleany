import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  NotFoundError,
  Quantity,
  type QuantityDto,
  toQuantityDto,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { InventoryLedger } from '../../inventory/index.js';
import { ProductCatalog } from '../../product/index.js';
import {
  assertOpen,
  normalizeSupplier,
  PURCHASE_STATUS_LABELS,
  type PurchaseStatus,
  purchaseLabel,
  validatePurchaseLines,
} from '../domain/purchase-order.js';
import {
  type PurchaseOrderRecord,
  PurchaseOrdersRepository,
} from './purchase-orders.repository.js';

export interface PurchaseOrderView {
  readonly id: string;
  readonly label: string;
  readonly supplier: string;
  readonly expectedDate: string | null;
  readonly status: PurchaseStatus;
  readonly statusLabel: string;
  readonly notes: string | null;
  readonly receiptDocument: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly receivedAt: string | null;
  readonly receivedBy: string | null;
  readonly cancelledAt: string | null;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    quantity: QuantityDto;
    receivedQuantity: QuantityDto | null;
  }[];
}

interface LineInput {
  readonly productId: string;
  readonly quantity: string;
  readonly unit?: string;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly orders: PurchaseOrdersRepository,
    private readonly catalog: ProductCatalog,
    private readonly inventory: InventoryLedger,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('purchasing')
  async list(filter: {
    statuses?: PurchaseStatus[];
    limit?: number;
  }): Promise<PurchaseOrderView[]> {
    const orders = await this.orders.list({
      limit: filter.limit ?? 100,
      ...(filter.statuses ? { statuses: filter.statuses } : {}),
    });
    return orders.map(toView);
  }

  @Transactional('purchasing')
  async get(id: string): Promise<PurchaseOrderView> {
    return toView(await this.require(id));
  }

  @Transactional('purchasing')
  async create(command: {
    supplier: string;
    expectedDate?: string;
    notes?: string;
    lines: readonly LineInput[];
  }): Promise<PurchaseOrderView> {
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
      return { product, quantity: Quantity.parse(line.quantity, line.unit ?? product.stockUnit) };
    });
    validatePurchaseLines(lines);
    const actor = this.currentActor.require();
    const id = await this.orders.insert({
      supplier: normalizeSupplier(command.supplier),
      expectedDate: command.expectedDate ?? null,
      notes: command.notes?.trim() ? command.notes.trim() : null,
      createdBy: { id: actor.id, name: actor.displayName },
      lines: lines.map(({ product, quantity }) => ({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unit: product.stockUnit,
        quantity: quantity.base,
      })),
    });
    return toView(await this.require(id));
  }

  /**
   * Registers the receipt in inventory with the real quantities (inventory's transaction, idempotent
   * per order) and closes the order. Lines left out are received as ordered.
   */
  async receive(
    id: string,
    command: { lines?: readonly LineInput[]; document?: string },
  ): Promise<PurchaseOrderView> {
    const order = await this.load(id);
    if (order.status === 'RECEIVED') return toView(order);
    assertOpen(order.status, 'receive');
    const received = new Map(order.lines.map((line) => [line.productId, line.quantity]));
    for (const input of command.lines ?? []) {
      const line = order.lines.find((l) => l.productId === input.productId);
      if (!line) {
        throw new ValidationError(
          'purchasing.line_not_in_order',
          'Uno de los productos no está en la orden.',
        );
      }
      const quantity = Quantity.parse(input.quantity, input.unit ?? line.unit);
      if (quantity.isNegative()) {
        throw new ValidationError(
          'purchasing.negative_quantity',
          'La cantidad recibida no puede ser negativa.',
        );
      }
      received.set(line.productId, quantity.base);
    }
    const lines = order.lines
      .filter((line) => (received.get(line.productId) ?? 0n) > 0n)
      .map((line) => ({
        productId: line.productId,
        quantity: toQuantityDto(received.get(line.productId) ?? 0n, line.unit).quantity,
        unit: line.unit,
      }));
    if (lines.length > 0) {
      await this.inventory.receive({
        idempotencyKey: `purchase-order:${order.id}`,
        lines,
        reference: {
          type: 'purchase_order',
          id: order.id,
          label: `${purchaseLabel(order.number)} · ${order.supplier}`,
        },
        ...(command.document ? { note: `Documento del proveedor: ${command.document}` } : {}),
      });
    }
    return this.finishReceipt(id, received, command.document ?? null);
  }

  @Transactional('purchasing')
  async cancel(id: string): Promise<PurchaseOrderView> {
    const order = await this.require(id);
    assertOpen(order.status, 'cancel');
    await this.orders.markCancelled(id, this.currentActor.require().displayName);
    return toView(await this.require(id));
  }

  @Transactional('purchasing')
  private load(id: string): Promise<PurchaseOrderRecord> {
    return this.require(id);
  }

  @Transactional('purchasing')
  private async finishReceipt(
    id: string,
    received: ReadonlyMap<string, bigint>,
    document: string | null,
  ): Promise<PurchaseOrderView> {
    await this.orders.markReceived(id, received, this.currentActor.require().displayName, document);
    return toView(await this.require(id));
  }

  private async require(id: string): Promise<PurchaseOrderRecord> {
    const order = await this.orders.findById(id);
    if (!order)
      throw new NotFoundError('purchasing.order_not_found', 'La orden de compra no existe.');
    return order;
  }
}

function toView(order: PurchaseOrderRecord): PurchaseOrderView {
  return {
    id: order.id,
    label: purchaseLabel(order.number),
    supplier: order.supplier,
    expectedDate: order.expectedDate,
    status: order.status,
    statusLabel: PURCHASE_STATUS_LABELS[order.status],
    notes: order.notes,
    receiptDocument: order.receiptDocument,
    createdBy: order.createdBy.name,
    createdAt: order.createdAt.toISOString(),
    receivedAt: order.receivedAt?.toISOString() ?? null,
    receivedBy: order.receivedByName,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      productCode: line.productCode,
      productName: line.productName,
      quantity: toQuantityDto(line.quantity, line.unit),
      receivedQuantity:
        line.receivedQuantity === null ? null : toQuantityDto(line.receivedQuantity, line.unit),
    })),
  };
}
