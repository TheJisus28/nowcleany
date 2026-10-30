import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { BillingTables } from '../billing.tables.js';

export interface InvoiceLineRecord {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: string;
  readonly quantity: bigint;
  readonly unitPrice: bigint;
  readonly amount: bigint;
  readonly fromStock: bigint;
  readonly pending: bigint;
}

export interface PaymentRecord {
  readonly id: string;
  readonly invoiceId: string;
  readonly amount: bigint;
  readonly paidOn: string;
  readonly method: string;
  readonly reference: string | null;
  readonly recordedByName: string;
  readonly createdAt: Date;
}

export interface InvoiceRecord {
  readonly id: string;
  readonly number: bigint;
  readonly orderId: string;
  readonly orderLabel: string;
  readonly customer: { id: string; name: string; document: string };
  readonly branchName: string;
  readonly seller: { id: string; name: string };
  readonly issuedAt: Date;
  readonly dueDate: string;
  readonly subtotal: bigint;
  readonly tax: bigint;
  readonly total: bigint;
  readonly paid: bigint;
  readonly issuedByName: string;
  readonly lines: readonly InvoiceLineRecord[];
}

export type NewInvoice = Omit<InvoiceRecord, 'id' | 'number' | 'paid' | 'issuedAt'> & {
  readonly issuedAt?: Date | undefined;
};

@Injectable()
export class InvoicesRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<BillingTables>,
  ) {}

  async insert(invoice: NewInvoice): Promise<{ id: string; number: bigint }> {
    const row = await this.host.tx
      .insertInto('invoices')
      .values({
        order_id: invoice.orderId,
        order_label: invoice.orderLabel,
        customer_id: invoice.customer.id,
        customer_name: invoice.customer.name,
        customer_document: invoice.customer.document,
        branch_name: invoice.branchName,
        seller_id: invoice.seller.id,
        seller_name: invoice.seller.name,
        due_date: invoice.dueDate,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        issued_by_name: invoice.issuedByName,
        ...(invoice.issuedAt ? { issued_at: invoice.issuedAt } : {}),
      })
      .returning(['id', 'number'])
      .executeTakeFirstOrThrow();
    await this.host.tx
      .insertInto('invoice_lines')
      .values(
        invoice.lines.map((line, index) => ({
          invoice_id: row.id,
          line_no: index + 1,
          product_id: line.productId,
          product_code: line.productCode,
          product_name: line.productName,
          unit: line.unit,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          amount: line.amount,
          from_stock: line.fromStock,
          pending: line.pending,
        })),
      )
      .execute();
    return row;
  }

  async list(filter: {
    customerId?: string | undefined;
    sellerId?: string | undefined;
    search?: string | undefined;
    onlyOpen?: boolean | undefined;
    issuedFrom?: Date | undefined;
    limit: number;
  }): Promise<InvoiceRecord[]> {
    let query = this.host.tx.selectFrom('invoices').selectAll();
    if (filter.customerId) query = query.where('customer_id', '=', filter.customerId);
    if (filter.sellerId) query = query.where('seller_id', '=', filter.sellerId);
    if (filter.onlyOpen) query = query.whereRef('paid', '<', 'total');
    if (filter.issuedFrom) query = query.where('issued_at', '>=', filter.issuedFrom);
    if (filter.search) {
      const text = filter.search.trim();
      const digits = /^(?:FV-?)?0*(\d+)$/i.exec(text)?.[1];
      const pattern = `%${text.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([
          eb('customer_name', 'ilike', pattern),
          eb('customer_document', 'ilike', pattern),
          ...(digits ? [eb('number', '=', BigInt(digits))] : []),
        ]),
      );
    }
    const rows = await query.orderBy('number', 'desc').limit(filter.limit).execute();
    return this.withLines(rows);
  }

  async findById(id: string): Promise<InvoiceRecord | undefined> {
    const rows = await this.host.tx
      .selectFrom('invoices')
      .selectAll()
      .where('id', '=', id)
      .execute();
    return (await this.withLines(rows))[0];
  }

  async findByOrders(orderIds: readonly string[]): Promise<InvoiceRecord[]> {
    if (orderIds.length === 0) return [];
    const rows = await this.host.tx
      .selectFrom('invoices')
      .selectAll()
      .where('order_id', 'in', orderIds)
      .execute();
    return this.withLines(rows);
  }

  async addPayment(payment: Omit<PaymentRecord, 'id' | 'createdAt'>): Promise<void> {
    await this.host.tx
      .insertInto('payments')
      .values({
        invoice_id: payment.invoiceId,
        amount: payment.amount,
        paid_on: payment.paidOn,
        method: payment.method,
        reference: payment.reference,
        recorded_by_name: payment.recordedByName,
      })
      .execute();
    await this.host.tx
      .updateTable('invoices')
      .set((eb) => ({ paid: eb('paid', '+', payment.amount) }))
      .where('id', '=', payment.invoiceId)
      .execute();
  }

  async payments(filter: {
    invoiceIds?: readonly string[];
    from?: string;
    to?: string;
  }): Promise<PaymentRecord[]> {
    let query = this.host.tx.selectFrom('payments').selectAll();
    if (filter.invoiceIds) {
      if (filter.invoiceIds.length === 0) return [];
      query = query.where('invoice_id', 'in', filter.invoiceIds);
    }
    if (filter.from) query = query.where('paid_on', '>=', filter.from);
    if (filter.to) query = query.where('paid_on', '<=', filter.to);
    const rows = await query.orderBy('paid_on', 'desc').orderBy('created_at', 'desc').execute();
    return rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoice_id,
      amount: row.amount,
      paidOn: row.paid_on,
      method: row.method,
      reference: row.reference,
      recordedByName: row.recorded_by_name,
      createdAt: row.created_at,
    }));
  }

  private async withLines(rows: readonly BillingRow[]): Promise<InvoiceRecord[]> {
    if (rows.length === 0) return [];
    const lines = await this.host.tx
      .selectFrom('invoice_lines')
      .selectAll()
      .where(
        'invoice_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('line_no')
      .execute();
    const byInvoice = new Map<string, InvoiceLineRecord[]>();
    for (const line of lines) {
      const list = byInvoice.get(line.invoice_id) ?? [];
      list.push({
        productId: line.product_id,
        productCode: line.product_code,
        productName: line.product_name,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        amount: line.amount,
        fromStock: line.from_stock,
        pending: line.pending,
      });
      byInvoice.set(line.invoice_id, list);
    }
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      orderId: row.order_id,
      orderLabel: row.order_label,
      customer: { id: row.customer_id, name: row.customer_name, document: row.customer_document },
      branchName: row.branch_name,
      seller: { id: row.seller_id, name: row.seller_name },
      issuedAt: row.issued_at,
      dueDate: row.due_date,
      subtotal: row.subtotal,
      tax: row.tax,
      total: row.total,
      paid: row.paid,
      issuedByName: row.issued_by_name,
      lines: byInvoice.get(row.id) ?? [],
    }));
  }
}

interface BillingRow {
  id: string;
  number: bigint;
  order_id: string;
  order_label: string;
  customer_id: string;
  customer_name: string;
  customer_document: string;
  branch_name: string;
  seller_id: string;
  seller_name: string;
  issued_at: Date;
  due_date: string;
  subtotal: bigint;
  tax: bigint;
  total: bigint;
  paid: bigint;
  issued_by_name: string;
}
