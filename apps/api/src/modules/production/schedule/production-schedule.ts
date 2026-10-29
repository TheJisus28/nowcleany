import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { productionLabel } from '../domain/production-order.js';
import { ProductionOrdersRepository } from '../orders/production-orders.repository.js';

export interface PlannedProduction {
  readonly id: string;
  readonly label: string;
  readonly productId: string;
  /** Base units still to be produced. */
  readonly quantity: bigint;
  readonly scheduledDate: string | null;
}

/** Public read API of the production module (planning: what is already scheduled). */
@Injectable()
export class ProductionSchedule {
  constructor(
    private readonly orders: ProductionOrdersRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async planned(): Promise<PlannedProduction[]> {
    this.currentActor.requirePermission('production:read');
    const orders = await this.orders.list({ statuses: ['PLANNED'], limit: 10_000 });
    return orders.map((order) => ({
      id: order.id,
      label: productionLabel(order.number),
      productId: order.product.id,
      quantity: order.plannedQuantity,
      scheduledDate: order.scheduledDate,
    }));
  }
}
