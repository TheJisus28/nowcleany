import { unit } from './units.js';

/** Colombian VAT on cleaning products: 19 %, in basis points. */
export const VAT_BPS = 1900n;

/** Rounds a / b half up (non-negative values). */
function divideRound(a: bigint, b: bigint): bigint {
  return (a * 2n + b) / (2n * b);
}

/**
 * Pesos for a quantity in base units (mg, mL, un) at a price per stock unit (kg, L, un), rounded to the
 * peso: 2 500 000 mg of a product at $8 000/kg = $20 000.
 */
export function amountFor(baseQuantity: bigint, pricePerUnit: bigint, unitCode: string): bigint {
  if (baseQuantity <= 0n || pricePerUnit <= 0n) return 0n;
  return divideRound(baseQuantity * pricePerUnit, unit(unitCode).factor);
}

export function vatOf(subtotal: bigint): bigint {
  return subtotal <= 0n ? 0n : divideRound(subtotal * VAT_BPS, 10_000n);
}

/** "$ 1.234.567": pesos as people read them (trail, messages). */
export function formatCop(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString();
  return `${sign}$ ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Pesos as a string for JSON ("125000"); the frontend formats them. */
export function moneyDto(value: bigint): string {
  return value.toString();
}

/** Parses pesos typed as an integer string ("42000"); null when it is not one. */
export function parseMoney(raw: string | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim().replace(/[.\s$]/g, '');
  return /^\d{1,13}$/.test(text) ? BigInt(text) : null;
}
