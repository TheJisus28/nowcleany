import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { UnitCode } from '../../../shared-kernel/index.js';
import type { DocumentType } from '../domain/customer.js';
import type { OrderStatus } from '../domain/sales-order.js';
import type { SalesTables } from '../sales.tables.js';

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
  readonly customer: {
    id: string;
    name: string;
    documentType: DocumentType;
    documentNumber: string;
  };
  readonly branch: { id: string; name: string; address: string | null; city: string | null };
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
  readonly branchId: string;
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
    return this.withLines(await query.orderBy('o.number', 'desc').limit(filter.limit).execute());
  }

  async findById(id: string): Promise<OrderRecord | undefined> {
    return (await this.withLines(await this.select().where('o.id', '=', id).execute()))[0];
  }

  async insert(content: OrderContent, seller: { id: string; name: string }): Promise<string> {
    const row = await this.host.tx
      .insertInto('sales_orders')
      .values({
        customer_id: content.customerId,
        branch_id: content.branchId,
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
        branch_id: content.branchId,
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

  async markConfirmed(id: string): Promise<void> {
    await this.setStatus(id, 'DRAFT', { status: 'CONFIRMED', confirmed_at: new Date() });
  }

  async markDispatched(id: string, byName: string): Promise<void> {
    await this.setStatus(id, 'CONFIRMED', {
      status: 'DISPATCHED',
      dispatched_at: new Date(),
      dispatched_by_name: byName,
    });
  }

  async markCancelled(id: string, byName: string, reason: string): Promise<void> {
    await this.host.tx
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
      .execute();
  }

  private async setStatus(
    id: string,
    from: OrderStatus,
    changes: {
      status: OrderStatus;
      confirmed_at?: Date;
      dispatched_at?: Date;
      dispatched_by_name?: string;
    },
  ): Promise<void> {
    await this.host.tx
      .updateTable('sales_orders')
      .set({ ...changes, updated_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', from)
      .execute();
  }

  private select() {
    return this.host.tx
      .selectFrom('sales_orders as o')
      .innerJoin('customers as c', 'c.id', 'o.customer_id')
      .innerJoin('customer_branches as b', 'b.id', 'o.branch_id')
      .select([
        'o.id',
        'o.number',
        'o.customer_id',
        'c.name as customer_name',
        'c.document_type as customer_document_type',
        'c.document_number as customer_document_number',
        'o.branch_id',
        'b.name as branch_name',
        'b.address as branch_address',
        'b.city as branch_city',
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

  private async withLines(
    rows: Awaited<ReturnType<ReturnType<SalesOrdersRepository['select']>['execute']>>,
  ): Promise<OrderRecord[]> {
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
      customer: {
        id: row.customer_id,
        name: row.customer_name,
        documentType: row.customer_document_type,
        documentNumber: row.customer_document_number,
      },
      branch: {
        id: row.branch_id,
        name: row.branch_name,
        address: row.branch_address,
        city: row.branch_city,
      },
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
