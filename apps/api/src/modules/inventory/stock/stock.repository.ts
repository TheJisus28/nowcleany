import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { sql } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { InventoryTables } from '../inventory.tables.js';
import type { Balance, MovementType } from '../domain/stock.js';

export interface Warehouse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface BalanceKey {
  readonly warehouseId: string;
  readonly productId: string;
}

export interface NewMovement extends BalanceKey {
  readonly operationId: string;
  readonly type: MovementType;
  readonly quantity: bigint;
  readonly balanceAfter: bigint;
  readonly reference: { type: string; id: string; label: string } | null;
  readonly note: string | null;
  readonly actor: { id: string; name: string };
}

export interface MovementRecord extends NewMovement {
  readonly id: bigint;
  readonly occurredAt: Date;
}

export interface MovementFilter {
  readonly productId?: string;
  readonly warehouseId?: string;
  readonly type?: MovementType;
  readonly from?: Date;
  readonly to?: Date;
  /** Keyset pagination: movements with id lower than this. */
  readonly before?: bigint;
  readonly limit: number;
}

export interface BalanceRecord extends BalanceKey, Balance {}

export const balanceKey = (key: BalanceKey): string => `${key.warehouseId}:${key.productId}`;

@Injectable()
export class StockRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<InventoryTables>,
  ) {}

  warehouses(): Promise<Warehouse[]> {
    return this.host.tx
      .selectFrom('warehouses')
      .select(['id', 'code', 'name'])
      .where('active', '=', true)
      .orderBy('code', 'desc')
      .execute();
  }

  async claimOperation(key: string, operationId: string, type: string): Promise<boolean> {
    const row = await this.host.tx
      .insertInto('operations')
      .values({ idempotency_key: key, operation_id: operationId, type })
      .onConflict((conflict) => conflict.column('idempotency_key').doNothing())
      .returning('idempotency_key')
      .executeTakeFirst();
    return row !== undefined;
  }

  async lockBalances(keys: readonly BalanceKey[]): Promise<Map<string, Balance>> {
    // Fixed order (warehouse, product) for both the insert and the lock: no deadlocks between operations.
    const unique = [...new Map(keys.map((key) => [balanceKey(key), key])).values()].sort((a, b) =>
      balanceKey(a).localeCompare(balanceKey(b)),
    );
    const result = new Map<string, Balance>();
    if (unique.length === 0) return result;
    await this.host.tx
      .insertInto('stock_balances')
      .values(unique.map((key) => ({ warehouse_id: key.warehouseId, product_id: key.productId })))
      .onConflict((conflict) => conflict.columns(['warehouse_id', 'product_id']).doNothing())
      .execute();
    const rows = await this.host.tx
      .selectFrom('stock_balances')
      .select(['warehouse_id', 'product_id', 'on_hand'])
      .where((eb) =>
        eb.or(
          unique.map((key) =>
            eb.and([
              eb('warehouse_id', '=', key.warehouseId),
              eb('product_id', '=', key.productId),
            ]),
          ),
        ),
      )
      .orderBy('warehouse_id')
      .orderBy('product_id')
      .forUpdate()
      .execute();
    for (const row of rows) {
      result.set(balanceKey({ warehouseId: row.warehouse_id, productId: row.product_id }), {
        onHand: row.on_hand,
      });
    }
    return result;
  }

  async saveBalance(key: BalanceKey, balance: Balance): Promise<void> {
    await this.host.tx
      .updateTable('stock_balances')
      .set({ on_hand: balance.onHand, updated_at: new Date() })
      .where('warehouse_id', '=', key.warehouseId)
      .where('product_id', '=', key.productId)
      .execute();
  }

  async insertMovements(movements: readonly NewMovement[]): Promise<void> {
    if (movements.length === 0) return;
    await this.host.tx
      .insertInto('stock_movements')
      .values(
        movements.map((movement) => ({
          operation_id: movement.operationId,
          warehouse_id: movement.warehouseId,
          product_id: movement.productId,
          type: movement.type,
          quantity: movement.quantity,
          balance_after: movement.balanceAfter,
          reference_type: movement.reference?.type ?? null,
          reference_id: movement.reference?.id ?? null,
          reference_label: movement.reference?.label ?? null,
          note: movement.note,
          actor_id: movement.actor.id,
          actor_name: movement.actor.name,
        })),
      )
      .execute();
  }

  async balances(productIds?: readonly string[]): Promise<BalanceRecord[]> {
    let query = this.host.tx
      .selectFrom('stock_balances')
      .select(['warehouse_id', 'product_id', 'on_hand']);
    if (productIds) {
      if (productIds.length === 0) return [];
      query = query.where('product_id', 'in', productIds);
    }
    const rows = await query.execute();
    return rows.map((row) => ({
      warehouseId: row.warehouse_id,
      productId: row.product_id,
      onHand: row.on_hand,
    }));
  }

  async movements(filter: MovementFilter): Promise<MovementRecord[]> {
    let query = this.host.tx.selectFrom('stock_movements').selectAll();
    if (filter.productId) query = query.where('product_id', '=', filter.productId);
    if (filter.warehouseId) query = query.where('warehouse_id', '=', filter.warehouseId);
    if (filter.type) query = query.where('type', '=', filter.type);
    if (filter.from) query = query.where('occurred_at', '>=', filter.from);
    if (filter.to) query = query.where('occurred_at', '<', filter.to);
    if (filter.before !== undefined) query = query.where('id', '<', filter.before);
    const rows = await query.orderBy('id', 'desc').limit(filter.limit).execute();
    return rows.map((row) => ({
      id: row.id,
      operationId: row.operation_id,
      warehouseId: row.warehouse_id,
      productId: row.product_id,
      type: row.type,
      quantity: row.quantity,
      balanceAfter: row.balance_after,
      reference:
        row.reference_type && row.reference_id
          ? { type: row.reference_type, id: row.reference_id, label: row.reference_label ?? '' }
          : null,
      note: row.note,
      actor: { id: row.actor_id, name: row.actor_name },
      occurredAt: row.occurred_at,
    }));
  }

  /**
   * Finished goods committed by confirmed pre-sales, per product. Informative only: pre-sales never
   * change the physical stock.
   */
  async committed(productIds: readonly string[]): Promise<Map<string, bigint>> {
    if (productIds.length === 0) return new Map();
    const rows = await sql<{ product_id: string; quantity: string }>`
      SELECT l.product_id, sum(l.quantity)::text AS quantity
      FROM sales_order_lines l
      JOIN sales_orders o ON o.id = l.order_id
      WHERE o.status = 'CONFIRMED' AND l.product_id IN (${sql.join(productIds)})
      GROUP BY l.product_id`.execute(this.host.tx);
    return new Map(rows.rows.map((row) => [row.product_id, BigInt(row.quantity)]));
  }
}
