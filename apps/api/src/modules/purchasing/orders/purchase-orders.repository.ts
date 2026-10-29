import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Selectable } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { UnitCode } from '../../../shared-kernel/index.js';
import type { PurchaseStatus } from '../domain/purchase-order.js';
import type { PurchasingTables } from '../purchasing.tables.js';

export interface PurchaseLineRecord {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: UnitCode;
  /** Base units. */
  readonly quantity: bigint;
  readonly receivedQuantity: bigint | null;
}

export interface PurchaseOrderRecord {
  readonly id: string;
  readonly number: bigint;
  readonly supplier: { id: string; name: string };
  readonly expectedDate: string | null;
  readonly status: PurchaseStatus;
  readonly notes: string | null;
  readonly receiptDocument: string | null;
  readonly createdBy: { id: string; name: string };
  readonly createdAt: Date;
  readonly receivedAt: Date | null;
  readonly receivedByName: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
  readonly lines: readonly PurchaseLineRecord[];
}

export interface NewPurchaseOrder {
  readonly supplier: { id: string; name: string };
  readonly expectedDate: string | null;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
  readonly lines: readonly Omit<PurchaseLineRecord, 'receivedQuantity'>[];
}

type OrderRow = Selectable<PurchasingTables['purchase_orders']>;

@Injectable()
export class PurchaseOrdersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<PurchasingTables>,
  ) {}

  async list(filter: {
    statuses?: readonly PurchaseStatus[];
    productId?: string;
    limit: number;
  }): Promise<PurchaseOrderRecord[]> {
    let query = this.host.tx.selectFrom('purchase_orders').selectAll();
    if (filter.statuses && filter.statuses.length > 0)
      query = query.where('status', 'in', filter.statuses);
    const { productId } = filter;
    if (productId)
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('purchase_order_lines as l')
            .select('l.order_id')
            .whereRef('l.order_id', '=', 'purchase_orders.id')
            .where('l.product_id', '=', productId),
        ),
      );
    return this.withLines(await query.orderBy('number', 'desc').limit(filter.limit).execute());
  }

  async findById(id: string): Promise<PurchaseOrderRecord | undefined> {
    const rows = await this.host.tx
      .selectFrom('purchase_orders')
      .selectAll()
      .where('id', '=', id)
      .execute();
    return (await this.withLines(rows))[0];
  }

  async insert(order: NewPurchaseOrder): Promise<string> {
    const row = await this.host.tx
      .insertInto('purchase_orders')
      .values({
        supplier_id: order.supplier.id,
        supplier: order.supplier.name,
        expected_date: order.expectedDate,
        status: 'OPEN',
        notes: order.notes,
        receipt_document: null,
        created_by: order.createdBy.id,
        created_by_name: order.createdBy.name,
        received_at: null,
        received_by_name: null,
        cancelled_at: null,
        cancelled_by_name: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.host.tx
      .insertInto('purchase_order_lines')
      .values(
        order.lines.map((line, index) => ({
          order_id: row.id,
          line_no: index + 1,
          product_id: line.productId,
          product_code: line.productCode,
          product_name: line.productName,
          unit: line.unit,
          quantity: line.quantity,
          received_quantity: null,
        })),
      )
      .execute();
    return row.id;
  }

  async markReceived(
    id: string,
    received: ReadonlyMap<string, bigint>,
    byName: string,
    document: string | null,
  ): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('purchase_orders')
      .set({
        status: 'RECEIVED',
        received_at: new Date(),
        received_by_name: byName,
        receipt_document: document,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'OPEN')
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) return false;
    for (const [productId, quantity] of received) {
      await this.host.tx
        .updateTable('purchase_order_lines')
        .set({ received_quantity: quantity })
        .where('order_id', '=', id)
        .where('product_id', '=', productId)
        .execute();
    }
    return true;
  }

  async markCancelled(id: string, byName: string): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('purchase_orders')
      .set({
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by_name: byName,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'OPEN')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  private async withLines(rows: readonly OrderRow[]): Promise<PurchaseOrderRecord[]> {
    if (rows.length === 0) return [];
    const lines = await this.host.tx
      .selectFrom('purchase_order_lines')
      .selectAll()
      .where(
        'order_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('line_no')
      .execute();
    const byOrder = new Map<string, PurchaseLineRecord[]>();
    for (const line of lines) {
      const list = byOrder.get(line.order_id) ?? [];
      list.push({
        productId: line.product_id,
        productCode: line.product_code,
        productName: line.product_name,
        unit: line.unit as UnitCode,
        quantity: line.quantity,
        receivedQuantity: line.received_quantity,
      });
      byOrder.set(line.order_id, list);
    }
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      supplier: { id: row.supplier_id, name: row.supplier },
      expectedDate: row.expected_date,
      status: row.status,
      notes: row.notes,
      receiptDocument: row.receipt_document,
      createdBy: { id: row.created_by, name: row.created_by_name },
      createdAt: row.created_at,
      receivedAt: row.received_at,
      receivedByName: row.received_by_name,
      cancelledAt: row.cancelled_at,
      cancelledByName: row.cancelled_by_name,
      lines: byOrder.get(row.id) ?? [],
    }));
  }
}
