import { ValidationError } from '../../../shared-kernel/index.js';

/** Days a customer has to pay an invoice. */
export const CREDIT_DAYS = 30;

export function invoiceLabel(number: bigint | number): string {
  return `FV-${number.toString().padStart(5, '0')}`;
}

export const PAYMENT_METHODS = ['TRANSFER', 'CASH', 'DEPOSIT', 'CHECK'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Partial<Record<string, string>> &
  Record<PaymentMethod, string> = {
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  DEPOSIT: 'Consignación',
  CHECK: 'Cheque',
};

export type CollectionStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';

export const COLLECTION_STATUS_LABELS: Record<CollectionStatus, string> = {
  PAID: 'Pagada',
  PARTIAL: 'Abonada',
  PENDING: 'Por cobrar',
  OVERDUE: 'Vencida',
};

/** Paid, partly paid, or still owed (overdue once its due date passed). */
export function collectionStatus(
  total: bigint,
  paid: bigint,
  dueDate: string,
  today: string,
): CollectionStatus {
  if (paid >= total) return 'PAID';
  if (dueDate < today) return 'OVERDUE';
  return paid > 0n ? 'PARTIAL' : 'PENDING';
}

/** Aging of what is owed: not due yet, or how long past its due date. */
export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D60_PLUS';

export const AGING_LABELS: Record<AgingBucket, string> = {
  CURRENT: 'Al día',
  D1_30: '1 a 30 días vencida',
  D31_60: '31 a 60 días vencida',
  D60_PLUS: 'Más de 60 días vencida',
};

export function agingBucket(dueDate: string, today: string): AgingBucket {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return 'D1_30';
  if (days <= 60) return 'D31_60';
  return 'D60_PLUS';
}

/** A payment cannot exceed what is still owed. */
export function validatePayment(amount: bigint, balance: bigint): void {
  if (amount <= 0n) {
    throw new ValidationError(
      'billing.invalid_amount',
      'El valor del pago debe ser mayor que cero.',
    );
  }
  if (amount > balance) {
    throw new ValidationError(
      'billing.overpayment',
      'El pago es mayor que el saldo pendiente de la factura.',
    );
  }
}

/** Today in Colombia (UTC−5), as "YYYY-MM-DD". */
export function todayInColombia(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
