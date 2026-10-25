import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  ConflictError,
  NotFoundError,
  Quantity,
  type QuantityDto,
  toQuantityDto,
  unit,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { InventoryLedger } from '../../inventory/index.js';
import { PRODUCT_TYPE_LABELS, ProductCatalog } from '../../product/index.js';
import {
  assertPlanned,
  assertProducible,
  batchesFor,
  PRODUCTION_KIND_LABELS,
  PRODUCTION_STATUS_LABELS,
  type ProductionStatus,
  productionLabel,
} from '../domain/production-order.js';
import {
  type ProductionOrderRecord,
  ProductionOrdersRepository,
} from './production-orders.repository.js';

export interface MaterialView {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly required: QuantityDto;
  readonly onHand: QuantityDto;
  /** What is missing in stock to run this order (0 when covered). */
  readonly shortage: QuantityDto;
}

export interface ProductionOrderView {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly status: ProductionStatus;
  readonly statusLabel: string;
  readonly product: { id: string; code: string; name: string; type: 'BULK' | 'FINISHED_GOOD' };
  readonly plannedQuantity: QuantityDto;
  readonly producedQuantity: QuantityDto | null;
  readonly batches: number | null;
  readonly batchCapacity: QuantityDto | null;
  readonly scheduledDate: string | null;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly completedBy: string | null;
  readonly cancelledAt: string | null;
  /** Only in the detail of a planned order: materials needed with the active formula. */
  readonly materials?: readonly MaterialView[];
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly orders: ProductionOrdersRepository,
    private readonly catalog: ProductCatalog,
    private readonly inventory: InventoryLedger,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('production')
  async list(filter: {
    statuses?: ProductionStatus[];
    productId?: string;
    limit?: number;
  }): Promise<ProductionOrderView[]> {
    const orders = await this.orders.list({
      limit: filter.limit ?? 100,
      ...(filter.statuses ? { statuses: filter.statuses } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
    });
    return orders.map(toView);
  }

  async get(id: string): Promise<ProductionOrderView> {
    const order = await this.load(id);
    if (order.status !== 'PLANNED') return toView(order);
    return {
      ...toView(order),
      materials: await this.materials(order.product.id, order.plannedQuantity),
    };
  }

  @Transactional('production')
  async create(command: {
    productId: string;
    quantity: string;
    unit?: string;
    scheduledDate?: string;
    notes?: string;
  }): Promise<ProductionOrderView> {
    const [product] = await this.catalog.findByIds([command.productId]);
    if (!product) throw new ValidationError('production.unknown_product', 'El producto no existe.');
    const type = assertProducible(product);
    const quantity = Quantity.parse(command.quantity, command.unit ?? product.stockUnit);
    if (quantity.dimension !== unit(product.stockUnit).dimension || !quantity.isPositive()) {
      throw new ValidationError(
        'production.invalid_quantity',
        `La cantidad debe ser mayor que cero y estar en una unidad compatible con ${product.stockUnit}.`,
      );
    }
    const check = await this.catalog.requirementsFor([
      { productId: product.id, quantity: quantity.base },
    ]);
    if (check.missingFormula.length > 0) {
      throw new ConflictError(
        'production.no_active_formula',
        `${product.code} no tiene fórmula vigente.`,
      );
    }
    const actor = this.currentActor.require();
    const id = await this.orders.insert({
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        type,
        unit: product.stockUnit,
      },
      batchCapacity: product.batchCapacity,
      plannedQuantity: quantity.base,
      scheduledDate: command.scheduledDate ?? null,
      notes: command.notes?.trim() ? command.notes.trim() : null,
      createdBy: { id: actor.id, name: actor.displayName },
    });
    return toView(await this.require(id));
  }

  /**
   * Records the real output: inventory adds the product and consumes the active formula for that
   * quantity (inventory's transaction, idempotent per order), then the order is marked completed.
   */
  async complete(
    id: string,
    command: { producedQuantity?: string; unit?: string },
  ): Promise<ProductionOrderView> {
    const order = await this.load(id);
    if (order.status === 'COMPLETED') return toView(order);
    assertPlanned(order.status, 'complete');
    const produced = command.producedQuantity
      ? Quantity.parse(command.producedQuantity, command.unit ?? order.product.unit).base
      : order.plannedQuantity;
    if (produced <= 0n) {
      throw new ValidationError(
        'production.invalid_quantity',
        'La cantidad producida debe ser mayor que cero.',
      );
    }
    const requirements = await this.catalog.requirementsFor([
      { productId: order.product.id, quantity: produced },
    ]);
    if (requirements.missingFormula.length > 0) {
      throw new ConflictError(
        'production.no_active_formula',
        `${order.product.code} no tiene fórmula vigente.`,
      );
    }
    await this.inventory.recordProduction({
      idempotencyKey: `production-order:${order.id}`,
      output: { productId: order.product.id, quantity: produced },
      consumptions: requirements.needs.map((need) => ({
        productId: need.componentId,
        quantity: need.quantity,
      })),
      reference: { type: 'production_order', id: order.id, label: productionLabel(order.number) },
    });
    return this.finish(id, produced);
  }

  @Transactional('production')
  async cancel(id: string): Promise<ProductionOrderView> {
    const order = await this.require(id);
    assertPlanned(order.status, 'cancel');
    await this.orders.markCancelled(id, this.currentActor.require().displayName);
    return toView(await this.require(id));
  }

  @Transactional('production')
  private load(id: string): Promise<ProductionOrderRecord> {
    return this.require(id);
  }

  @Transactional('production')
  private async finish(id: string, produced: bigint): Promise<ProductionOrderView> {
    await this.orders.markCompleted(id, produced, this.currentActor.require().displayName);
    return toView(await this.require(id));
  }

  private async materials(productId: string, quantity: bigint): Promise<MaterialView[]> {
    const { needs } = await this.catalog.requirementsFor([{ productId, quantity }]);
    const ids = needs.map((need) => need.componentId);
    const [products, levels] = await Promise.all([
      this.catalog.findByIds(ids),
      this.inventory.stockLevels(ids),
    ]);
    return needs.flatMap((need) => {
      const product = products.find((p) => p.id === need.componentId);
      if (!product) return [];
      const onHand = levels.find((level) => level.productId === need.componentId)?.onHand ?? 0n;
      const shortage = need.quantity > onHand ? need.quantity - (onHand > 0n ? onHand : 0n) : 0n;
      return [
        {
          productId: product.id,
          code: product.code,
          name: product.name,
          typeLabel: PRODUCT_TYPE_LABELS[product.type],
          required: toQuantityDto(need.quantity, product.stockUnit),
          onHand: toQuantityDto(onHand, product.stockUnit),
          shortage: toQuantityDto(shortage, product.stockUnit),
        },
      ];
    });
  }

  private async require(id: string): Promise<ProductionOrderRecord> {
    const order = await this.orders.findById(id);
    if (!order)
      throw new NotFoundError('production.order_not_found', 'La orden de producción no existe.');
    return order;
  }
}

function toView(order: ProductionOrderRecord): ProductionOrderView {
  const unitCode = order.product.unit;
  return {
    id: order.id,
    label: productionLabel(order.number),
    kind: PRODUCTION_KIND_LABELS[order.product.type],
    status: order.status,
    statusLabel: PRODUCTION_STATUS_LABELS[order.status],
    product: {
      id: order.product.id,
      code: order.product.code,
      name: order.product.name,
      type: order.product.type,
    },
    plannedQuantity: toQuantityDto(order.plannedQuantity, unitCode),
    producedQuantity:
      order.producedQuantity === null ? null : toQuantityDto(order.producedQuantity, unitCode),
    batches: batchesFor(order.producedQuantity ?? order.plannedQuantity, order.batchCapacity),
    batchCapacity:
      order.batchCapacity === null ? null : toQuantityDto(order.batchCapacity, unitCode),
    scheduledDate: order.scheduledDate,
    notes: order.notes,
    createdBy: order.createdBy.name,
    createdAt: order.createdAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    completedBy: order.completedByName,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}
