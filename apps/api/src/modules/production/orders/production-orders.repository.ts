import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Selectable } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { UnitCode } from '../../../shared-kernel/index.js';
import type { ProductionTables } from '../production.tables.js';
import type { ProducibleType, ProductionStatus } from '../domain/production-order.js';

export interface ProductionOrderRecord {
  readonly id: string;
  readonly number: bigint;
  readonly product: {
    id: string;
    code: string;
    name: string;
    type: ProducibleType;
    unit: UnitCode;
  };
  readonly batchCapacity: bigint | null;
  readonly plannedQuantity: bigint;
  readonly producedQuantity: bigint | null;
  readonly status: ProductionStatus;
  readonly scheduledDate: string | null;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly completedByName: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
}

export interface NewProductionOrder {
  readonly product: ProductionOrderRecord['product'];
  readonly batchCapacity: bigint | null;
  readonly plannedQuantity: bigint;
  readonly scheduledDate: string | null;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
}

@Injectable()
export class ProductionOrdersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<ProductionTables>,
  ) {}

  async list(filter: {
    statuses?: readonly ProductionStatus[];
    productId?: string;
    limit: number;
  }): Promise<ProductionOrderRecord[]> {
    let query = this.host.tx.selectFrom('production_orders').selectAll();
    if (filter.statuses && filter.statuses.length > 0)
      query = query.where('status', 'in', filter.statuses);
    if (filter.productId) query = query.where('product_id', '=', filter.productId);
    const rows = await query.orderBy('number', 'desc').limit(filter.limit).execute();
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ProductionOrderRecord | undefined> {
    const row = await this.host.tx
      .selectFrom('production_orders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && toRecord(row);
  }

  async insert(order: NewProductionOrder): Promise<string> {
    const row = await this.host.tx
      .insertInto('production_orders')
      .values({
        product_id: order.product.id,
        product_code: order.product.code,
        product_name: order.product.name,
        product_type: order.product.type,
        unit: order.product.unit,
        batch_capacity: order.batchCapacity,
        planned_quantity: order.plannedQuantity,
        produced_quantity: null,
        status: 'PLANNED',
        scheduled_date: order.scheduledDate,
        notes: order.notes,
        created_by: order.createdBy.id,
        created_by_name: order.createdBy.name,
        completed_at: null,
        completed_by_name: null,
        cancelled_at: null,
        cancelled_by_name: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async markCompleted(id: string, producedQuantity: bigint, byName: string): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('production_orders')
      .set({
        status: 'COMPLETED',
        produced_quantity: producedQuantity,
        completed_at: new Date(),
        completed_by_name: byName,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'PLANNED')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async markCancelled(id: string, byName: string): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('production_orders')
      .set({
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by_name: byName,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'PLANNED')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}

function toRecord(row: Selectable<ProductionTables['production_orders']>): ProductionOrderRecord {
  return {
    id: row.id,
    number: row.number,
    product: {
      id: row.product_id,
      code: row.product_code,
      name: row.product_name,
      type: row.product_type,
      unit: row.unit as UnitCode,
    },
    batchCapacity: row.batch_capacity,
    plannedQuantity: row.planned_quantity,
    producedQuantity: row.produced_quantity,
    status: row.status,
    scheduledDate: row.scheduled_date,
    notes: row.notes,
    createdBy: { id: row.created_by, name: row.created_by_name },
    createdAt: row.created_at,
    completedAt: row.completed_at,
    completedByName: row.completed_by_name,
    cancelledAt: row.cancelled_at,
    cancelledByName: row.cancelled_by_name,
  };
}
