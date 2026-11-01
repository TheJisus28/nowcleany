import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  amountFor,
  formatCop,
  NotFoundError,
  parseMoney,
  Quantity,
  type QuantityDto,
  toQuantityDto,
  type UnitCode,
  ValidationError,
  vatOf,
} from '../../../shared-kernel/index.js';
import { Trail } from '../../audit/index.js';
import { InventoryLedger } from '../../inventory/index.js';
import {
  assertOpen,
  purchaseLabel,
  SUPPLIER_CREDIT_DAYS,
  supplierInvoiceDocument,
} from '../domain/purchase-order.js';
import { PurchaseOrdersRepository } from '../orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from '../orders/purchase-orders.service.js';
import {
  type SupplierInvoiceRecord,
  SupplierInvoicesRepository,
  type SupplierPaymentRecord,
} from './supplier-invoices.repository.js';

const METHODS: Record<string, string> = {
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  DEPOSIT: 'Consignación',
  CHECK: 'Cheque',
};

export interface SupplierInvoiceView {
  readonly id: string;
  readonly purchaseOrder: { id: string; label: string };
  readonly supplier: { id: string; name: string };
  readonly documentNumber: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly total: string;
  readonly paid: string;
  readonly balance: string;
  readonly overdue: boolean;
  readonly receivedBy: string;
  readonly createdAt: string;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    quantity: QuantityDto;
    unitCost: string;
    amount: string;
  }[];
  readonly payments?: readonly {
    id: string;
    amount: string;
    paidOn: string;
    methodLabel: string;
    reference: string | null;
    recordedBy: string;
  }[];
}

const today = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Receiving enters each supplier invoice against the purchase order it belongs to: the invoice is the
 * support document and, with it, the goods that arrived enter the stock. An order may receive several
 * invoices (partial deliveries). The accountant pays them.
 */
@Injectable()
export class SupplierInvoicesService {
  constructor(
    private readonly invoices: SupplierInvoicesRepository,
    private readonly orders: PurchaseOrdersRepository,
    private readonly orderService: PurchaseOrdersService,
    private readonly inventory: InventoryLedger,
    private readonly trail: Trail,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async list(filter: {
    purchaseOrderId?: string | undefined;
    supplierId?: string | undefined;
    onlyOpen?: boolean | undefined;
    limit?: number | undefined;
  }): Promise<SupplierInvoiceView[]> {
    const rows = await this.invoices.list({
      ...filter,
      limit: Math.min(filter.limit ?? 300, 2000),
    });
    const labels = await this.orderLabels(rows);
    return rows.map((row) => toView(row, labels.get(row.purchaseOrderId) ?? ''));
  }

  @Transactional()
  async get(id: string): Promise<SupplierInvoiceView> {
    const invoice = await this.require(id);
    const payments = await this.invoices.payments({ supplierInvoiceIds: [id] });
    const labels = await this.orderLabels([invoice]);
    return toView(invoice, labels.get(invoice.purchaseOrderId) ?? '', payments);
  }

  /** Enters a supplier invoice: what arrived goes into stock and counts against the order. */
  @Transactional()
  async register(
    purchaseOrderId: string,
    command: {
      documentNumber: string;
      invoiceDate: string;
      warehouse?: string;
      lines: readonly { productId: string; quantity: string; unitCost?: string }[];
    },
    at?: Date,
    options: { historic?: boolean } = {},
  ): Promise<SupplierInvoiceView> {
    this.currentActor.requirePermission('purchasing:receive');
    const order = await this.orderService.require(purchaseOrderId);
    assertOpen(order.status, 'receive');
    const documentNumber = supplierInvoiceDocument(command.documentNumber);
    const lines = command.lines
      .map((input) => {
        const line = order.lines.find((item) => item.productId === input.productId);
        if (!line) {
          throw new ValidationError(
            'purchasing.line_not_in_order',
            'Uno de los productos de la factura no está en la orden de compra.',
          );
        }
        const quantity = Quantity.parse(input.quantity, line.unit);
        const unitCost =
          input.unitCost === undefined
            ? line.unitCost
            : (parseMoney(input.unitCost) ?? line.unitCost);
        return {
          productId: line.productId,
          productCode: line.productCode,
          productName: line.productName,
          unit: line.unit,
          quantity: quantity.base,
          unitCost,
          amount: amountFor(quantity.base, unitCost, line.unit),
        };
      })
      .filter((line) => line.quantity > 0n);
    if (lines.length === 0) {
      throw new ValidationError(
        'purchasing.empty_invoice',
        'Indica las cantidades que llegaron con esta factura.',
      );
    }
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0n);
    const tax = vatOf(subtotal);
    const actor = this.currentActor.require();
    const id = await this.invoices.insert({
      purchaseOrderId,
      supplier: order.supplier,
      documentNumber,
      invoiceDate: command.invoiceDate,
      dueDate: addDays(command.invoiceDate, SUPPLIER_CREDIT_DAYS),
      subtotal,
      tax,
      total: subtotal + tax,
      receivedByName: actor.displayName,
      createdAt: at,
      lines,
    });
    if (!options.historic)
      await this.inventory.receive({
        idempotencyKey: `supplier-invoice:${id}`,
        ...(command.warehouse ? { warehouseCode: command.warehouse } : {}),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: toQuantityDto(line.quantity, line.unit).quantity,
          unit: line.unit,
        })),
        reference: {
          type: 'purchase_order',
          id: order.id,
          label: `${purchaseLabel(order.number)} · ${order.supplier.name}`,
        },
        note: `Factura del proveedor ${documentNumber}`,
      });
    const received = new Map(lines.map((line) => [line.productId, line.quantity]));
    const complete = order.lines.every(
      (line) => line.receivedQuantity + (received.get(line.productId) ?? 0n) >= line.quantity,
    );
    await this.orders.addReceived(
      purchaseOrderId,
      received,
      complete ? 'RECEIVED' : 'PARTIAL',
      actor.displayName,
      at,
    );
    await this.trail.record({
      entity: 'purchase_order',
      id: order.id,
      label: purchaseLabel(order.number),
      action: 'received',
      summary: `Ingresó la factura ${documentNumber} de ${order.supplier.name} por ${formatCop(
        subtotal + tax,
      )}: ${lines
        .map((line) => `${line.productCode} × ${toQuantityDto(line.quantity, line.unit).quantity}`)
        .join(
          ', ',
        )}. ${complete ? 'La orden quedó recibida completa.' : 'La orden queda recibida parcial.'}`,
      at,
    });
    return this.get(id);
  }

  @Transactional()
  async pay(
    id: string,
    command: { amount: string; paidOn: string; method: string; reference?: string },
    at?: Date,
  ): Promise<SupplierInvoiceView> {
    this.currentActor.requirePermission('payments:write');
    const invoice = await this.require(id);
    const amount = parseMoney(command.amount);
    const balance = invoice.total - invoice.paid;
    if (amount === null || amount <= 0n) {
      throw new ValidationError('purchasing.invalid_amount', 'Escribe el valor del pago en pesos.');
    }
    if (amount > balance) {
      throw new ValidationError(
        'purchasing.overpayment',
        'El pago es mayor que el saldo pendiente de la factura del proveedor.',
      );
    }
    if (!(command.method in METHODS)) {
      throw new ValidationError('purchasing.invalid_method', 'Medio de pago desconocido.');
    }
    await this.invoices.addPayment({
      supplierInvoiceId: id,
      amount,
      paidOn: command.paidOn,
      method: command.method,
      reference: command.reference?.trim() ? command.reference.trim() : null,
      recordedByName: this.currentActor.require().displayName,
    });
    await this.trail.record({
      entity: 'purchase_order',
      id: invoice.purchaseOrderId,
      label: `Factura ${invoice.documentNumber}`,
      action: 'paid',
      summary: `Pagó ${formatCop(amount)} a ${invoice.supplier.name} por la factura ${invoice.documentNumber}${
        balance - amount > 0n
          ? `; queda un saldo de ${formatCop(balance - amount)}`
          : '; quedó pagada'
      }.`,
      at,
    });
    return this.get(id);
  }

  /** Read API for finance: what is owed to suppliers and what was paid. */
  @Transactional()
  async ledger(filter: { from?: string; to?: string }) {
    const invoices = await this.invoices.list({ limit: 5000 });
    const payments = await this.invoices.payments(filter);
    return { invoices, payments };
  }

  private async require(id: string): Promise<SupplierInvoiceRecord> {
    const invoice = await this.invoices.findById(id);
    if (!invoice) {
      throw new NotFoundError(
        'purchasing.invoice_not_found',
        'La factura del proveedor no existe.',
      );
    }
    return invoice;
  }

  private async orderLabels(rows: readonly SupplierInvoiceRecord[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.purchaseOrderId))];
    const labels = new Map<string, string>();
    for (const id of ids) {
      const order = await this.orders.findById(id);
      if (order) labels.set(id, purchaseLabel(order.number));
    }
    return labels;
  }
}

function toView(
  invoice: SupplierInvoiceRecord,
  orderLabel: string,
  payments?: readonly SupplierPaymentRecord[],
): SupplierInvoiceView {
  const balance = invoice.total - invoice.paid;
  return {
    id: invoice.id,
    purchaseOrder: { id: invoice.purchaseOrderId, label: orderLabel },
    supplier: invoice.supplier,
    documentNumber: invoice.documentNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal.toString(),
    tax: invoice.tax.toString(),
    total: invoice.total.toString(),
    paid: invoice.paid.toString(),
    balance: balance.toString(),
    overdue: balance > 0n && invoice.dueDate < today(),
    receivedBy: invoice.receivedByName,
    createdAt: invoice.createdAt.toISOString(),
    lines: invoice.lines.map((line) => ({
      productId: line.productId,
      productCode: line.productCode,
      productName: line.productName,
      quantity: toQuantityDto(line.quantity, line.unit as UnitCode),
      unitCost: line.unitCost.toString(),
      amount: line.amount.toString(),
    })),
    ...(payments
      ? {
          payments: payments.map((payment) => ({
            id: payment.id,
            amount: payment.amount.toString(),
            paidOn: payment.paidOn,
            methodLabel: METHODS[payment.method] ?? payment.method,
            reference: payment.reference,
            recordedBy: payment.recordedByName,
          })),
        }
      : {}),
  };
}
