import { type QuantityDto, toQuantityDto, type UnitCode } from '../../../shared-kernel/index.js';
import {
  AGING_LABELS,
  type AgingBucket,
  agingBucket,
  COLLECTION_STATUS_LABELS,
  type CollectionStatus,
  collectionStatus,
  invoiceLabel,
  PAYMENT_METHOD_LABELS,
} from '../domain/invoice.js';
import type { InvoiceRecord, PaymentRecord } from './invoices.repository.js';

export interface PaymentView {
  readonly id: string;
  readonly amount: string;
  readonly paidOn: string;
  readonly method: string;
  readonly methodLabel: string;
  readonly reference: string | null;
  readonly recordedBy: string;
}

export interface InvoiceView {
  readonly id: string;
  readonly label: string;
  readonly order: { id: string; label: string };
  readonly customer: { id: string; name: string; document: string };
  readonly branchName: string;
  readonly seller: { id: string; name: string };
  readonly issuedAt: string;
  readonly issuedBy: string;
  readonly dueDate: string;
  /** Pesos, as integer strings. */
  readonly subtotal: string;
  readonly tax: string;
  readonly total: string;
  readonly paid: string;
  readonly balance: string;
  readonly status: CollectionStatus;
  readonly statusLabel: string;
  readonly aging: AgingBucket | null;
  readonly agingLabel: string | null;
  /** Some product was invoiced before it existed (to make or to buy). */
  readonly hasPending: boolean;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    quantity: QuantityDto;
    unitPrice: string;
    amount: string;
    fromStock: QuantityDto;
    pending: QuantityDto;
  }[];
  readonly payments?: readonly PaymentView[];
}

export function toPaymentView(payment: PaymentRecord): PaymentView {
  return {
    id: payment.id,
    amount: payment.amount.toString(),
    paidOn: payment.paidOn,
    method: payment.method,
    methodLabel: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
    reference: payment.reference,
    recordedBy: payment.recordedByName,
  };
}

export function toInvoiceView(
  invoice: InvoiceRecord,
  today: string,
  payments?: readonly PaymentRecord[],
): InvoiceView {
  const balance = invoice.total - invoice.paid;
  const status = collectionStatus(invoice.total, invoice.paid, invoice.dueDate, today);
  const aging = balance > 0n ? agingBucket(invoice.dueDate, today) : null;
  return {
    id: invoice.id,
    label: invoiceLabel(invoice.number),
    order: { id: invoice.orderId, label: invoice.orderLabel },
    customer: invoice.customer,
    branchName: invoice.branchName,
    seller: invoice.seller,
    issuedAt: invoice.issuedAt.toISOString(),
    issuedBy: invoice.issuedByName,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal.toString(),
    tax: invoice.tax.toString(),
    total: invoice.total.toString(),
    paid: invoice.paid.toString(),
    balance: balance.toString(),
    status,
    statusLabel: COLLECTION_STATUS_LABELS[status],
    aging,
    agingLabel: aging ? AGING_LABELS[aging] : null,
    hasPending: invoice.lines.some((line) => line.pending > 0n),
    lines: invoice.lines.map((line) => {
      const unit = line.unit as UnitCode;
      return {
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        quantity: toQuantityDto(line.quantity, unit),
        unitPrice: line.unitPrice.toString(),
        amount: line.amount.toString(),
        fromStock: toQuantityDto(line.fromStock, unit),
        pending: toQuantityDto(line.pending, unit),
      };
    }),
    ...(payments ? { payments: payments.map(toPaymentView) } : {}),
  };
}
