import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { UnitCode } from '../../../shared-kernel/index.js';
import type { SalesTables } from '../sales.tables.js';

interface OrderRow {
  id: string;
  number: bigint;
  customer_id: string;
  customer_name: string;
  customer_tax_id: string | null;
  seller_id: string;
  seller_name: string;
  status: OrderRecord['status'];
  estimated_delivery_date: string | null;
  notes: string | null;
  created_at: Date;
  confirmed_at: Date | null;
  dispatched_at: Date | null;
  dispatched_by_name: string | null;
  cancelled_at: Date | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
}
import type { OrderStatus } from '../domain/sales-order.js';

export interface OrderLineRecord {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: UnitCode;
  /** Base units of the product. */
  readonly quantity: bigint;
}

export interface OrderRecord {
  readonly id: string;
  readonly number: bigint;
  readonly customer: { id: string; name: string; taxId: string | null };
  readonly seller: { id: string; name: string };
  readonly status: OrderStatus;
  readonly estimatedDeliveryDate: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly dispatchedAt: Date | null;
  readonly dispatchedByName: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
  readonly cancelReason: string | null;
  readonly lines: readonly OrderLineRecord[];
}

export interface OrderFilter {
  readonly statuses?: readonly OrderStatus[];
  readonly sellerId?: string;
  readonly customerId?: string;
  /** Orders with at least one line of this product. */
  readonly productId?: string;
  /** Order number ("PV-00012" or "12") or customer name. */
  readonly search?: string;
  readonly limit: number;
}

export interface OrderContent {
  readonly customerId: string;
  readonly estimatedDeliveryDate: string | null;
  readonly notes: string | null;
  readonly lines: readonly OrderLineRecord[];
}

@Injectable()
export class SalesOrdersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<SalesTables>,
  ) {}

  async list(filter: OrderFilter): Promise<OrderRecord[]> {
    let query = this.select();
    if (filter.statuses && filter.statuses.length > 0)
      query = query.where('o.status', 'in', filter.statuses);
    if (filter.sellerId) query = query.where('o.seller_id', '=', filter.sellerId);
    if (filter.customerId) query = query.where('o.customer_id', '=', filter.customerId);
    const { productId } = filter;
    if (productId)
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('sales_order_lines as l')
            .select('l.order_id')
            .whereRef('l.order_id', '=', 'o.id')
            .where('l.product_id', '=', productId),
        ),
      );
    if (filter.search) {
      const number = /^(?:PV-)?0*(\d{1,12})$/i.exec(filter.search.trim())?.[1];
      const pattern = `%${filter.search.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([
          eb('c.name', 'ilike', pattern),
          ...(number ? [eb('o.number', '=', BigInt(number))] : []),
        ]),
      );
    }
    const rows = await query.orderBy('o.number', 'desc').limit(filter.limit).execute();
    return this.withLines(rows);
  }

  async findById(id: string): Promise<OrderRecord | undefined> {
    const rows = await this.select().where('o.id', '=', id).execute();
    return (await this.withLines(rows))[0];
  }

  async insert(content: OrderContent, seller: { id: string; name: string }): Promise<string> {
    const row = await this.host.tx
      .insertInto('sales_orders')
      .values({
        customer_id: content.customerId,
        seller_id: seller.id,
        seller_name: seller.name,
        status: 'DRAFT',
        estimated_delivery_date: content.estimatedDeliveryDate,
        notes: content.notes,
        confirmed_at: null,
        dispatched_at: null,
        dispatched_by_name: null,
        cancelled_at: null,
        cancelled_by_name: null,
        cancel_reason: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.insertLines(row.id, content.lines);
    return row.id;
  }

  async update(id: string, content: OrderContent): Promise<void> {
    await this.host.tx
      .updateTable('sales_orders')
      .set({
        customer_id: content.customerId,
        estimated_delivery_date: content.estimatedDeliveryDate,
        notes: content.notes,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'DRAFT')
      .execute();
    await this.host.tx.deleteFrom('sales_order_lines').where('order_id', '=', id).execute();
    await this.insertLines(id, content.lines);
  }

  async markConfirmed(id: string): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('sales_orders')
      .set({
        status: 'CONFIRMED',
        confirmed_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'DRAFT')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async markDispatched(id: string, byName: string): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('sales_orders')
      .set({
        status: 'DISPATCHED',
        dispatched_at: new Date(),
        dispatched_by_name: byName,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'CONFIRMED')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async markCancelled(id: string, byName: string, reason: string): Promise<boolean> {
    const result = await this.host.tx
      .updateTable('sales_orders')
      .set({
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by_name: byName,
        cancel_reason: reason,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('status', 'in', ['DRAFT', 'CONFIRMED'])
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  private select() {
    return this.host.tx
      .selectFrom('sales_orders as o')
      .innerJoin('customers as c', 'c.id', 'o.customer_id')
      .select([
        'o.id',
        'o.number',
        'o.customer_id',
        'c.name as customer_name',
        'c.tax_id as customer_tax_id',
        'o.seller_id',
        'o.seller_name',
        'o.status',
        'o.estimated_delivery_date',
        'o.notes',
        'o.created_at',
        'o.confirmed_at',
        'o.dispatched_at',
        'o.dispatched_by_name',
        'o.cancelled_at',
        'o.cancelled_by_name',
        'o.cancel_reason',
      ]);
  }

  private async insertLines(orderId: string, lines: readonly OrderLineRecord[]): Promise<void> {
    await this.host.tx
      .insertInto('sales_order_lines')
      .values(
        lines.map((line, index) => ({
          order_id: orderId,
          line_no: index + 1,
          product_id: line.productId,
          product_code: line.productCode,
          product_name: line.productName,
          unit: line.unit,
          quantity: line.quantity,
        })),
      )
      .execute();
  }

  private async withLines(rows: readonly OrderRow[]): Promise<OrderRecord[]> {
    if (rows.length === 0) return [];
    const lines = await this.host.tx
      .selectFrom('sales_order_lines')
      .selectAll()
      .where(
        'order_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('line_no')
      .execute();
    const byOrder = new Map<string, OrderLineRecord[]>();
    for (const line of lines) {
      const list = byOrder.get(line.order_id) ?? [];
      list.push({
        productId: line.product_id,
        productCode: line.product_code,
        productName: line.product_name,
        unit: line.unit as UnitCode,
        quantity: line.quantity,
      });
      byOrder.set(line.order_id, list);
    }
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      customer: { id: row.customer_id, name: row.customer_name, taxId: row.customer_tax_id },
      seller: { id: row.seller_id, name: row.seller_name },
      status: row.status,
      estimatedDeliveryDate: row.estimated_delivery_date,
      notes: row.notes,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      dispatchedAt: row.dispatched_at,
      dispatchedByName: row.dispatched_by_name,
      cancelledAt: row.cancelled_at,
      cancelledByName: row.cancelled_by_name,
      cancelReason: row.cancel_reason,
      lines: byOrder.get(row.id) ?? [],
    }));
  }
}
