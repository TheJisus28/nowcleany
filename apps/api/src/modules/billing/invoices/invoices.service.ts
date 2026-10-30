import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  amountFor,
  ConflictError,
  formatCop,
  NotFoundError,
  parseMoney,
  ValidationError,
  vatOf,
} from '../../../shared-kernel/index.js';
import { Trail } from '../../audit/index.js';
import { PlanningService } from '../../planning/index.js';
import { ProductCatalog } from '../../product/index.js';
import { SalesDirectory, type SalesOrderRecord } from '../../sales/index.js';
import {
  addDays,
  CREDIT_DAYS,
  invoiceLabel,
  PAYMENT_METHODS,
  type PaymentMethod,
  todayInColombia,
  validatePayment,
  type InvoiceDocumentType,
} from '../domain/invoice.js';
import { type InvoiceView, toInvoiceView } from './invoice-view.js';
import { type InvoiceRecord, InvoicesRepository } from './invoices.repository.js';

export interface IssueCommand {
  readonly orderId: string;
  /** Plant may hand over what exists now and the rest later. */
  readonly allowPartial?: boolean;
  /** Which invoices get the available stock first (1 first). */
  readonly priority?: number | null;
  /** FEL (with VAT) unless the customer asked for a remisión. */
  readonly documentType?: InvoiceDocumentType;
}

/**
 * The consolidator invoices the pre-sales the sellers sent, always: what the stock does not cover is
 * invoiced as pending (to make or to buy) and the flow takes it from there. The accountant records
 * what customers pay.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoices: InvoicesRepository,
    private readonly sales: SalesDirectory,
    private readonly catalog: ProductCatalog,
    private readonly planning: PlanningService,
    private readonly trail: Trail,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async list(filter: {
    customerId?: string | undefined;
    search?: string | undefined;
    onlyOpen?: boolean | undefined;
    limit?: number | undefined;
  }): Promise<InvoiceView[]> {
    this.currentActor.requirePermission('invoices:read');
    const today = todayInColombia();
    const rows = await this.invoices.list({
      customerId: filter.customerId,
      search: filter.search,
      onlyOpen: filter.onlyOpen,
      limit: Math.min(filter.limit ?? 200, 2000),
    });
    return rows.map((invoice) => toInvoiceView(invoice, today));
  }

  @Transactional()
  async get(id: string): Promise<InvoiceView> {
    this.currentActor.requirePermission('invoices:read');
    const invoice = await this.require(id);
    const payments = await this.invoices.payments({ invoiceIds: [id] });
    return toInvoiceView(invoice, todayInColombia(), payments);
  }

  /** The invoice of an order, if it was invoiced (for the order page). */
  @Transactional()
  async ofOrder(orderId: string): Promise<InvoiceView | null> {
    this.currentActor.requirePermission('invoices:read');
    const [invoice] = await this.invoices.findByOrders([orderId]);
    if (!invoice) return null;
    const payments = await this.invoices.payments({ invoiceIds: [invoice.id] });
    return toInvoiceView(invoice, todayInColombia(), payments);
  }

  /** Consolidates and invoices pre-sales sent by the sellers (one invoice per order). */
  @Transactional()
  async issue(
    commands: readonly IssueCommand[],
    at?: Date,
    options: { historic?: boolean } = {},
  ): Promise<InvoiceView[]> {
    this.currentActor.requirePermission('invoices:issue');
    if (commands.length === 0) {
      throw new ValidationError('billing.no_orders', 'Elige al menos una preventa para facturar.');
    }
    const coverage = options.historic
      ? new Map<string, Map<string, { fromStock: bigint; pending: bigint }>>()
      : await this.planning.coverageByOrder();
    const issued: InvoiceRecord[] = [];
    for (const command of commands) {
      const order = await this.sales.get(command.orderId);
      if (order.status !== 'CONFIRMED') {
        throw new ConflictError(
          'billing.not_to_invoice',
          `${order.label} no está por facturar (estado actual: ${order.status}).`,
        );
      }
      const id = await this.invoiceOrder(
        order,
        coverage.get(order.id),
        command,
        at,
        options.historic,
      );
      const invoice = await this.require(id);
      issued.push(invoice);
    }
    const today = todayInColombia();
    return issued.map((invoice) => toInvoiceView(invoice, today));
  }

  @Transactional()
  async recordPayment(
    id: string,
    command: { amount: string; paidOn: string; method: string; reference?: string },
    /** Seeds backdate history. */
    at?: Date,
  ): Promise<InvoiceView> {
    this.currentActor.requirePermission('payments:write');
    const invoice = await this.require(id);
    const amount = parseMoney(command.amount);
    if (amount === null) {
      throw new ValidationError('billing.invalid_amount', 'Escribe el valor del pago en pesos.');
    }
    validatePayment(amount, invoice.total - invoice.paid);
    if (!PAYMENT_METHODS.includes(command.method as PaymentMethod)) {
      throw new ValidationError('billing.invalid_method', 'Medio de pago desconocido.');
    }
    const actor = this.currentActor.require();
    await this.invoices.addPayment({
      invoiceId: id,
      amount,
      paidOn: command.paidOn,
      method: command.method,
      reference: command.reference?.trim() ? command.reference.trim() : null,
      recordedByName: actor.displayName,
    });
    const balance = invoice.total - invoice.paid - amount;
    await this.trail.record({
      entity: 'sales_order',
      id: invoice.orderId,
      label: invoiceLabel(invoice.number, invoice.documentType),
      action: 'collected',
      summary: `Registró un cobro de ${formatCop(amount)} a la ${invoiceLabel(invoice.number, invoice.documentType)}${
        balance > 0n ? `; queda un saldo de ${formatCop(balance)}` : '; la factura quedó pagada'
      }.`,
      at,
    });
    return this.get(id);
  }

  // --- helpers ---------------------------------------------------------------------------

  private async invoiceOrder(
    order: SalesOrderRecord,
    coverage: ReadonlyMap<string, { fromStock: bigint; pending: bigint }> | undefined,
    command: IssueCommand,
    at?: Date,
    historic = false,
  ): Promise<string> {
    const products = new Map(
      (await this.catalog.findByIds(order.lines.map((line) => line.productId))).map((p) => [
        p.id,
        p,
      ]),
    );
    const lines = order.lines.map((line) => {
      const price = products.get(line.productId)?.price ?? null;
      if (price === null) {
        throw new ValidationError(
          'billing.no_price',
          `${line.productCode} no tiene precio de venta: pídele a gerencia que lo registre.`,
        );
      }
      const covered = coverage?.get(line.productId);
      const fromStock = historic
        ? line.quantity
        : covered
          ? covered.fromStock < line.quantity
            ? covered.fromStock
            : line.quantity
          : 0n;
      return {
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: price,
        amount: amountFor(line.quantity, price, line.unit),
        fromStock,
        pending: line.quantity - fromStock,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0n);
    const documentType = command.documentType ?? 'FEL';
    const tax = documentType === 'FEL' ? vatOf(subtotal) : 0n;
    const issuedOn = at ? todayInColombia(at) : todayInColombia();
    const actor = this.currentActor.require();
    const { id, number } = await this.invoices.insert({
      documentType,
      orderId: order.id,
      orderLabel: order.label,
      customer: {
        id: order.customer.id,
        name: order.customer.name,
        document: `${order.customer.documentType === 'NIT' ? 'NIT' : 'CC'} ${order.customer.documentNumber}`,
      },
      branchName: order.branch.name,
      seller: order.seller,
      issuedAt: at,
      dueDate: addDays(issuedOn, CREDIT_DAYS),
      subtotal,
      tax,
      total: subtotal + tax,
      issuedByName: actor.displayName,
      lines,
    });
    await this.sales.markInvoiced(
      order.id,
      {
        label: invoiceLabel(number, documentType),
        total: formatCop(subtotal + tax),
        allowPartial: command.allowPartial ?? false,
        priority: command.priority ?? null,
        pending: lines.some((line) => line.pending > 0n),
      },
      at,
    );
    return id;
  }

  private async require(id: string): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findById(id);
    if (!invoice) throw new NotFoundError('billing.invoice_not_found', 'La factura no existe.');
    return invoice;
  }
}
