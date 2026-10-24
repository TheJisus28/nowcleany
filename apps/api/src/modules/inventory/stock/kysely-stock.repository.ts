import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { sql } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { Balance } from '../domain/stock.js';
import type { InventoryTables } from '../inventory.tables.js';
import {
  type BalanceKey,
  balanceKey,
  type BalanceRecord,
  type MovementFilter,
  type MovementRecord,
  type NewMovement,
  type ReservationRecord,
  StockRepository,
  type Warehouse,
} from './stock.repository.js';

@Injectable()
export class KyselyStockRepository extends StockRepository {
  constructor(
    @InjectTransactionHost('inventory')
    private readonly host: ModuleTransactionHost<InventoryTables>,
  ) {
    super();
  }

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

  async lockOrder(orderId: string): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`inventory.order:${orderId}`}))`.execute(
      this.host.tx,
    );
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
      .select(['warehouse_id', 'product_id', 'on_hand', 'reserved'])
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
        reserved: row.reserved,
      });
    }
    return result;
  }

  async saveBalance(key: BalanceKey, balance: Balance): Promise<void> {
    await this.host.tx
      .updateTable('stock_balances')
      .set({ on_hand: balance.onHand, reserved: balance.reserved, updated_at: new Date() })
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
      .select(['warehouse_id', 'product_id', 'on_hand', 'reserved']);
    if (productIds) {
      if (productIds.length === 0) return [];
      query = query.where('product_id', 'in', productIds);
    }
    const rows = await query.execute();
    return rows.map((row) => ({
      warehouseId: row.warehouse_id,
      productId: row.product_id,
      onHand: row.on_hand,
      reserved: row.reserved,
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

  async reservationsOf(orderId: string): Promise<ReservationRecord[]> {
    const rows = await this.host.tx
      .selectFrom('reservations')
      .selectAll()
      .where('order_id', '=', orderId)
      .execute();
    return rows.map(toReservation);
  }

  async reservations(productIds?: readonly string[]): Promise<ReservationRecord[]> {
    let query = this.host.tx.selectFrom('reservations').selectAll();
    if (productIds) {
      if (productIds.length === 0) return [];
      query = query.where('product_id', 'in', productIds);
    }
    const rows = await query.orderBy('created_at').execute();
    return rows.map(toReservation);
  }

  async insertReservations(rows: readonly Omit<ReservationRecord, 'createdAt'>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.host.tx
      .insertInto('reservations')
      .values(
        rows.map((row) => ({
          order_id: row.orderId,
          order_label: row.orderLabel,
          product_id: row.productId,
          warehouse_id: row.warehouseId,
          quantity: row.quantity,
        })),
      )
      .execute();
  }

  async deleteReservations(orderId: string): Promise<void> {
    await this.host.tx.deleteFrom('reservations').where('order_id', '=', orderId).execute();
  }
}

function toReservation(row: {
  order_id: string;
  order_label: string;
  product_id: string;
  warehouse_id: string;
  quantity: bigint;
  created_at: Date;
}): ReservationRecord {
  return {
    orderId: row.order_id,
    orderLabel: row.order_label,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    quantity: row.quantity,
    createdAt: row.created_at,
  };
}
