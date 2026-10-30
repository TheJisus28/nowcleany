import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
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
  /** Handed over by plant, waiting for a guide. */
  readonly readyQuantity: bigint;
  readonly dispatchedQuantity: bigint;
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
  readonly priority: number | null;
  readonly allowPartial: boolean;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly invoicedAt: Date | null;
  readonly invoicedByName: string | null;
  readonly readyAt: Date | null;
  readonly readyByName: string | null;
  readonly dispatchedAt: Date | null;
  readonly dispatchedByName: string | null;
  readonly deliveredAt: Date | null;
  readonly receivedBy: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
  readonly cancelReason: string | null;
  readonly lines: readonly OrderLineRecord[];
}

export interface NewOrderLine {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: UnitCode;
  readonly quantity: bigint;
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
  readonly lines: readonly NewOrderLine[];
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
        invoiced_at: null,
        invoiced_by_name: null,
        ready_at: null,
        ready_by_name: null,
        dispatched_at: null,
        dispatched_by_name: null,
        delivered_at: null,
        received_by: null,
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

  async markInvoiced(
    id: string,
    byName: string,
    options: { allowPartial: boolean; priority: number | null },
    at = new Date(),
  ): Promise<void> {
    await this.setStatus(id, 'CONFIRMED', {
      status: 'INVOICED',
      invoiced_at: at,
      invoiced_by_name: byName,
      allow_partial: options.allowPartial,
      priority: options.priority,
    });
  }

  async setPriority(id: string, priority: number | null): Promise<void> {
    await this.host.tx
      .updateTable('sales_orders')
      .set({ priority, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /** Plant handed over these quantities (per product) to dispatch. */
  async markReady(
    id: string,
    from: OrderStatus,
    ready: ReadonlyMap<string, bigint>,
    byName: string,
    at = new Date(),
  ): Promise<void> {
    for (const [productId, quantity] of ready) {
      await this.host.tx
        .updateTable('sales_order_lines')
        .set({ ready_quantity: quantity })
        .where('order_id', '=', id)
        .where('product_id', '=', productId)
        .execute();
    }
    await this.setStatus(id, from, { status: 'READY', ready_at: at, ready_by_name: byName });
  }

  /** A guide took these quantities: they leave "ready" and count as dispatched. */
  async registerDispatch(
    id: string,
    lines: ReadonlyMap<string, bigint>,
    status: OrderStatus,
    byName: string,
    at = new Date(),
  ): Promise<void> {
    for (const [productId, quantity] of lines) {
      await this.host.tx
        .updateTable('sales_order_lines')
        .set((eb) => ({
          dispatched_quantity: eb('dispatched_quantity', '+', quantity),
          ready_quantity: sql<bigint>`greatest(0, ready_quantity - ${quantity})`,
        }))
        .where('order_id', '=', id)
        .where('product_id', '=', productId)
        .execute();
    }
    await this.setStatus(id, 'READY', {
      status,
      dispatched_at: at,
      dispatched_by_name: byName,
    });
  }

  async markDelivered(id: string, receivedBy: string, at = new Date()): Promise<void> {
    await this.setStatus(id, 'DISPATCHED', {
      status: 'DELIVERED',
      delivered_at: at,
      received_by: receivedBy,
    });
  }

  /** Seeds only: a past order that was dispatched and delivered (today's stock is not touched). */
  async completeHistory(
    id: string,
    history: { dispatchedAt: Date; deliveredAt: Date; byName: string; receivedBy: string },
  ): Promise<void> {
    await this.host.tx
      .updateTable('sales_order_lines')
      .set((eb) => ({ dispatched_quantity: eb.ref('quantity'), ready_quantity: 0n }))
      .where('order_id', '=', id)
      .execute();
    await this.host.tx
      .updateTable('sales_orders')
      .set({
        status: 'DELIVERED',
        dispatched_at: history.dispatchedAt,
        dispatched_by_name: history.byName,
        delivered_at: history.deliveredAt,
        received_by: history.receivedBy,
        updated_at: history.deliveredAt,
      })
      .where('id', '=', id)
      .execute();
  }

  /** Seeds only: backdates an order's creation (sales history). */
  async backdate(id: string, createdAt: Date): Promise<void> {
    await this.host.tx
      .updateTable('sales_orders')
      .set({ created_at: createdAt, confirmed_at: createdAt, updated_at: createdAt })
      .where('id', '=', id)
      .execute();
  }

  /** Quantities of each product in orders invoiced in [from, to). */
  async soldBetween(
    from: Date,
    to: Date,
    statuses: readonly OrderStatus[],
  ): Promise<{ productId: string; quantity: bigint; orders: number }[]> {
    const rows = await this.host.tx
      .selectFrom('sales_order_lines as l')
      .innerJoin('sales_orders as o', 'o.id', 'l.order_id')
      .select((eb) => [
        'l.product_id',
        eb.fn.sum<string>('l.quantity').as('quantity'),
        eb.fn.count<string>('o.id').distinct().as('orders'),
      ])
      .where('o.status', 'in', statuses)
      .where('o.invoiced_at', '>=', from)
      .where('o.invoiced_at', '<', to)
      .groupBy('l.product_id')
      .execute();
    return rows.map((row) => ({
      productId: row.product_id,
      quantity: BigInt(row.quantity),
      orders: Number(row.orders),
    }));
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
      invoiced_at?: Date;
      invoiced_by_name?: string;
      allow_partial?: boolean;
      priority?: number | null;
      ready_at?: Date;
      ready_by_name?: string;
      dispatched_at?: Date;
      dispatched_by_name?: string;
      delivered_at?: Date;
      received_by?: string;
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
        'o.priority',
        'o.allow_partial',
        'o.created_at',
        'o.confirmed_at',
        'o.invoiced_at',
        'o.invoiced_by_name',
        'o.ready_at',
        'o.ready_by_name',
        'o.dispatched_at',
        'o.dispatched_by_name',
        'o.delivered_at',
        'o.received_by',
        'o.cancelled_at',
        'o.cancelled_by_name',
        'o.cancel_reason',
      ]);
  }

  private async insertLines(orderId: string, lines: readonly NewOrderLine[]): Promise<void> {
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
        readyQuantity: line.ready_quantity,
        dispatchedQuantity: line.dispatched_quantity,
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
      priority: row.priority,
      allowPartial: row.allow_partial,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      invoicedAt: row.invoiced_at,
      invoicedByName: row.invoiced_by_name,
      readyAt: row.ready_at,
      readyByName: row.ready_by_name,
      dispatchedAt: row.dispatched_at,
      dispatchedByName: row.dispatched_by_name,
      deliveredAt: row.delivered_at,
      receivedBy: row.received_by,
      cancelledAt: row.cancelled_at,
      cancelledByName: row.cancelled_by_name,
      cancelReason: row.cancel_reason,
      lines: byOrder.get(row.id) ?? [],
    }));
  }
}
