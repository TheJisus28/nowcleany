import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { PurchasingTables } from '../purchasing.tables.js';

export interface PlanLine {
  readonly productId: string;
  /** Base units the month is expected to need. */
  readonly quantity: bigint;
  readonly setByName: string;
  readonly updatedAt: Date;
}

@Injectable()
export class PurchasePlansRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<PurchasingTables>,
  ) {}

  /** `month` is the first day of the month ("2026-11-01"). */
  async forMonth(month: string): Promise<PlanLine[]> {
    const rows = await this.host.tx
      .selectFrom('purchase_plans')
      .selectAll()
      .where('month', '=', month)
      .execute();
    return rows.map((row) => ({
      productId: row.product_id,
      quantity: row.quantity,
      setByName: row.set_by_name,
      updatedAt: row.updated_at,
    }));
  }

  async save(
    month: string,
    lines: readonly { productId: string; quantity: bigint }[],
    byName: string,
  ): Promise<void> {
    for (const line of lines) {
      await this.host.tx
        .insertInto('purchase_plans')
        .values({ month, product_id: line.productId, quantity: line.quantity, set_by_name: byName })
        .onConflict((oc) =>
          oc.columns(['month', 'product_id']).doUpdateSet({
            quantity: line.quantity,
            set_by_name: byName,
            updated_at: new Date(),
          }),
        )
        .execute();
    }
  }
}
