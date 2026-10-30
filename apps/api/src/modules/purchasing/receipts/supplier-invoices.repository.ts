import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { PurchasingTables } from '../purchasing.tables.js';

export interface SupplierInvoiceLineRecord {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: string;
  readonly quantity: bigint;
  readonly unitCost: bigint;
  readonly amount: bigint;
}

export interface SupplierInvoiceRecord {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly supplier: { id: string; name: string };
  readonly documentNumber: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly subtotal: bigint;
  readonly tax: bigint;
  readonly total: bigint;
  readonly paid: bigint;
  readonly receivedByName: string;
  readonly createdAt: Date;
  readonly lines: readonly SupplierInvoiceLineRecord[];
}

export interface SupplierPaymentRecord {
  readonly id: string;
  readonly supplierInvoiceId: string;
  readonly amount: bigint;
  readonly paidOn: string;
  readonly method: string;
  readonly reference: string | null;
  readonly recordedByName: string;
}

@Injectable()
export class SupplierInvoicesRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<PurchasingTables>,
  ) {}

  async insert(
    invoice: Omit<SupplierInvoiceRecord, 'id' | 'paid' | 'createdAt'> & {
      createdAt?: Date | undefined;
    },
  ): Promise<string> {
    try {
      const row = await this.host.tx
        .insertInto('supplier_invoices')
        .values({
          purchase_order_id: invoice.purchaseOrderId,
          supplier_id: invoice.supplier.id,
          supplier_name: invoice.supplier.name,
          document_number: invoice.documentNumber,
          invoice_date: invoice.invoiceDate,
          due_date: invoice.dueDate,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          total: invoice.total,
          received_by_name: invoice.receivedByName,
          ...(invoice.createdAt ? { created_at: invoice.createdAt } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.host.tx
        .insertInto('supplier_invoice_lines')
        .values(
          invoice.lines.map((line, index) => ({
            supplier_invoice_id: row.id,
            line_no: index + 1,
            product_id: line.productId,
            product_code: line.productCode,
            product_name: line.productName,
            unit: line.unit,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            amount: line.amount,
          })),
        )
        .execute();
      return row.id;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new ConflictError(
          'purchasing.invoice_already_entered',
          `La factura ${invoice.documentNumber} de ${invoice.supplier.name} ya fue ingresada.`,
        );
      }
      throw error;
    }
  }

  async list(filter: {
    purchaseOrderId?: string | undefined;
    supplierId?: string | undefined;
    onlyOpen?: boolean | undefined;
    limit: number;
  }): Promise<SupplierInvoiceRecord[]> {
    let query = this.host.tx.selectFrom('supplier_invoices').selectAll();
    if (filter.purchaseOrderId)
      query = query.where('purchase_order_id', '=', filter.purchaseOrderId);
    if (filter.supplierId) query = query.where('supplier_id', '=', filter.supplierId);
    if (filter.onlyOpen) query = query.whereRef('paid', '<', 'total');
    const rows = await query
      .orderBy('invoice_date', 'desc')
      .orderBy('created_at', 'desc')
      .limit(filter.limit)
      .execute();
    if (rows.length === 0) return [];
    const lines = await this.host.tx
      .selectFrom('supplier_invoice_lines')
      .selectAll()
      .where(
        'supplier_invoice_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('line_no')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      supplier: { id: row.supplier_id, name: row.supplier_name },
      documentNumber: row.document_number,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      subtotal: row.subtotal,
      tax: row.tax,
      total: row.total,
      paid: row.paid,
      receivedByName: row.received_by_name,
      createdAt: row.created_at,
      lines: lines
        .filter((line) => line.supplier_invoice_id === row.id)
        .map((line) => ({
          productId: line.product_id,
          productCode: line.product_code,
          productName: line.product_name,
          unit: line.unit,
          quantity: line.quantity,
          unitCost: line.unit_cost,
          amount: line.amount,
        })),
    }));
  }

  async findById(id: string): Promise<SupplierInvoiceRecord | undefined> {
    const row = await this.host.tx
      .selectFrom('supplier_invoices')
      .select('purchase_order_id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return undefined;
    return (await this.list({ purchaseOrderId: row.purchase_order_id, limit: 500 })).find(
      (invoice) => invoice.id === id,
    );
  }

  async addPayment(payment: Omit<SupplierPaymentRecord, 'id'>): Promise<void> {
    await this.host.tx
      .insertInto('supplier_payments')
      .values({
        supplier_invoice_id: payment.supplierInvoiceId,
        amount: payment.amount,
        paid_on: payment.paidOn,
        method: payment.method,
        reference: payment.reference,
        recorded_by_name: payment.recordedByName,
      })
      .execute();
    await this.host.tx
      .updateTable('supplier_invoices')
      .set((eb) => ({ paid: eb('paid', '+', payment.amount) }))
      .where('id', '=', payment.supplierInvoiceId)
      .execute();
  }

  async payments(filter: {
    supplierInvoiceIds?: readonly string[];
    from?: string;
    to?: string;
  }): Promise<SupplierPaymentRecord[]> {
    let query = this.host.tx.selectFrom('supplier_payments').selectAll();
    if (filter.supplierInvoiceIds) {
      if (filter.supplierInvoiceIds.length === 0) return [];
      query = query.where('supplier_invoice_id', 'in', filter.supplierInvoiceIds);
    }
    if (filter.from) query = query.where('paid_on', '>=', filter.from);
    if (filter.to) query = query.where('paid_on', '<=', filter.to);
    const rows = await query.orderBy('paid_on', 'desc').execute();
    return rows.map((row) => ({
      id: row.id,
      supplierInvoiceId: row.supplier_invoice_id,
      amount: row.amount,
      paidOn: row.paid_on,
      method: row.method,
      reference: row.reference,
      recordedByName: row.recorded_by_name,
    }));
  }
}
