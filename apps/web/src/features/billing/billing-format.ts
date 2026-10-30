import type { PaymentMethod } from '../../api/types';
import { daysUntil } from '../../lib/format';

/**
 * Money helpers for billing and accounting screens. Pesos travel as integer strings and are added
 * with bigint; numbers are used only for chart geometry.
 */

/** Pesos for a decimal quantity at an integer unit price, rounded half up ("2.5" × "1000" → 2500n). */
export function amountFor(quantity: string, unitPrice: string): bigint {
  const negative = quantity.startsWith('-');
  const [integerPart = '0', fraction = ''] = (negative ? quantity.slice(1) : quantity).split('.');
  const scale = 10n ** BigInt(fraction.length);
  const raw = BigInt(`${integerPart}${fraction}`) * BigInt(unitPrice);
  const rounded = (raw + scale / 2n) / scale;
  return negative ? -rounded : rounded;
}

/** Colombian VAT on goods: 19 % of the subtotal, rounded to the peso. */
export function vatOf(subtotal: bigint): bigint {
  return (subtotal * 19n + 50n) / 100n;
}

/** Subtotal plus VAT. */
export function withVat(subtotal: bigint): bigint {
  return subtotal + vatOf(subtotal);
}

export function sumPesos(values: readonly (string | bigint)[]): bigint {
  return values.reduce<bigint>((sum, value) => sum + BigInt(value), 0n);
}

/** What people type as pesos ("1.250.000", "$ 1250000") → "1250000" (digits only). */
export function pesosInput(raw: string): string {
  return raw
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 13);
}

/** Lowercase without accents, for local search ("Bogotá" matches "bogota"). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Calendar day in Colombia (UTC−5) of an instant: "2026-10-29". */
export function colombiaDay(instant: string): string {
  return new Date(new Date(instant).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** "2026-10-29 14:05" in Colombia time, for exports and audit grids. */
export function colombiaDateTime(instant: string): string {
  return new Date(new Date(instant).getTime() - 5 * 3_600_000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

export function timeOf(instant: string): string {
  return new Date(instant).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

/** "jueves, 29 de octubre" for day headings. */
export function dayHeading(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export const PAYMENT_METHODS: readonly { value: PaymentMethod; label: string }[] = [
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CASH', label: 'Efectivo' },
  { value: 'DEPOSIT', label: 'Consignación' },
  { value: 'CHECK', label: 'Cheque' },
];

// --- aging (cartera y cuentas por pagar) ---------------------------------------------------------

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D60_PLUS';

/** The aging columns of a receivables or payables consultation, in order. */
export const AGING_BUCKETS: readonly { key: AgingBucket; label: string; long: string }[] = [
  { key: 'CURRENT', label: 'Al día', long: 'Al día' },
  { key: 'D1_30', label: '1–30', long: '1 a 30 días vencida' },
  { key: 'D31_60', label: '31–60', long: '31 a 60 días vencida' },
  { key: 'D60_PLUS', label: 'Más de 60', long: 'Más de 60 días vencida' },
];

/** Days past the due date (0 when it is not due yet). */
export function daysOverdue(dueDate: string): number {
  const days = daysUntil(dueDate);
  return days === null ? 0 : Math.max(0, -days);
}

/** Same buckets as the API: not due, 1–30, 31–60 and more than 60 days overdue. */
export function agingOf(dueDate: string): AgingBucket {
  const days = daysOverdue(dueDate);
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return 'D1_30';
  if (days <= 60) return 'D31_60';
  return 'D60_PLUS';
}

/** Units of a set of lines for display ("1.250"): never used for business math. */
export function sumQuantities(values: readonly string[]): number {
  return values.reduce((sum, value) => sum + Number(value), 0);
}

export function formatUnits(value: number): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}
