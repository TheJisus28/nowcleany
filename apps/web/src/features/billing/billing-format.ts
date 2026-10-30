import type { PaymentMethod } from '../../api/types';

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

/** Colombian VAT on goods: 19 %, rounded to the peso. */
export function withVat(subtotal: bigint): bigint {
  return subtotal + (subtotal * 19n + 50n) / 100n;
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
