import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { Quantity, ValidationError } from '../../../shared-kernel/index.js';
import { ProductCatalog, SELLABLE_TYPES } from '../../product/index.js';
import { type PlanLine, PurchasePlansRepository } from './purchase-plans.repository.js';

/** "2026-11" → "2026-11-01". */
export function monthStart(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ValidationError('purchasing.invalid_month', 'El mes debe tener el formato AAAA-MM.');
  }
  return `${month}-01`;
}

/**
 * Purchasing's plan for a month: how much of each product it expects to sell. Planning turns it into
 * what to buy (raw materials through the formulas, resale goods as they are).
 */
@Injectable()
export class PurchasePlansService {
  constructor(
    private readonly plans: PurchasePlansRepository,
    private readonly catalog: ProductCatalog,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  forMonth(month: string): Promise<PlanLine[]> {
    return this.plans.forMonth(monthStart(month));
  }

  @Transactional()
  async save(
    month: string,
    lines: readonly { productId: string; quantity: string }[],
  ): Promise<PlanLine[]> {
    this.currentActor.requirePermission('purchasing:write');
    const start = monthStart(month);
    const products = new Map(
      (await this.catalog.findByIds(lines.map((line) => line.productId))).map((p) => [p.id, p]),
    );
    const parsed = lines.map((line) => {
      const product = products.get(line.productId);
      if (!product || !SELLABLE_TYPES.includes(product.type)) {
        throw new ValidationError(
          'purchasing.not_plannable',
          'El plan del mes es de productos que se venden (terminados y mercancía de reventa).',
        );
      }
      return {
        productId: product.id,
        quantity: Quantity.parse(line.quantity, product.stockUnit).base,
      };
    });
    const actor = this.currentActor.require();
    await this.plans.save(start, parsed, actor.displayName);
    return this.plans.forMonth(start);
  }
}
