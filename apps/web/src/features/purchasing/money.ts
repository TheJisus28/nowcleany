import type { PurchaseOrder } from '../../api/types';
import { formatDecimal } from '../../lib/format';

/** Colombian VAT on goods (19 %), in basis points, as the API applies it. */
const VAT_BPS = 1900n;

/** Rounds a non-negative fraction to the nearest integer (half up), like the API. */
function divideRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Pesos for a quantity at a unit cost ("12.5" kg × "2400" $/kg = 30000), exact and rounded to the
 * peso. Only for previews: the API computes the amounts that are stored.
 */
export function amountOf(quantity: string | null, unitCost: string | null): bigint {
  if (!quantity || !unitCost) return 0n;
  const [integer = '0', fraction = ''] = quantity.split('.');
  const scaled = BigInt(`${integer}${fraction}` || '0');
  const cost = BigInt(unitCost);
  if (scaled <= 0n || cost <= 0n) return 0n;
  return divideRound(scaled * cost, 10n ** BigInt(fraction.length));
}

export function vatOf(subtotal: bigint): bigint {
  return subtotal <= 0n ? 0n : divideRound(subtotal * VAT_BPS, 10_000n);
}

/** Reads pesos as people type them ("2.400", "$ 2400", "2400") → "2400"; null when invalid. */
export function parseMoneyInput(raw: string): string | null {
  const value = raw.replace(/[\s$]/g, '').replace(/\./g, '');
  if (value === '') return null;
  if (!/^\d{1,13}$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, '');
}

/** "2400" → "2.400" for an input field ("" when there is no value). */
export function moneyInput(value: string | null | undefined): string {
  return value ? formatDecimal(value) : '';
}

/** Pesos still to arrive on a purchase order (pending × agreed cost, before VAT). */
export function pendingValue(order: PurchaseOrder): bigint {
  return order.lines.reduce(
    (sum, line) => sum + amountOf(line.pending.quantity, line.unitCost),
    0n,
  );
}
