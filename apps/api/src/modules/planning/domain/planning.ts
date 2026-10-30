/**
 * Net-requirements planning (MRP without safety stock): overselling is allowed, so demand is never
 * capped; what is missing is produced or bought, and purchases are exactly the net shortage.
 */

export const max0 = (value: bigint): bigint => (value > 0n ? value : 0n);

/**
 * What still has to be made or bought: gross need minus usable stock minus what is already on its way.
 * Negative physical stock (movements recorded out of order) counts as zero, never as extra need.
 */
export function net(gross: bigint, onHand: bigint, scheduled = 0n): bigint {
  return max0(gross - max0(onHand) - scheduled);
}

export function sumBy<T>(
  items: readonly T[],
  key: (item: T) => string,
  value: (item: T) => bigint,
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0n) + value(item));
  return totals;
}

export interface DemandLine {
  readonly orderId: string;
  readonly orderLabel: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly estimatedDeliveryDate: string | null;
  readonly confirmedAt: Date | null;
  /** Set by the consolidator on invoiced orders: served before everything else (lower first). */
  readonly priority: number | null;
  readonly productId: string;
  readonly quantity: bigint;
}

export type CoverageStatus = 'COVERED' | 'NEEDS_PRODUCTION' | 'SHORT';

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  COVERED: 'Cubierto con stock',
  NEEDS_PRODUCTION: 'Requiere producción',
  SHORT: 'Falta comprar',
};

export interface LineCoverage extends DemandLine {
  readonly fromStock: bigint;
  readonly fromProduction: bigint;
  readonly uncovered: bigint;
  readonly status: CoverageStatus;
}

/**
 * The consolidator's priority first (invoiced orders he ranked), then the earliest promised delivery
 * (orders without a date last), then the oldest confirmation.
 */
export function byPriority(a: DemandLine, b: DemandLine): number {
  if (a.priority !== b.priority) {
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  }
  if (a.estimatedDeliveryDate !== b.estimatedDeliveryDate) {
    if (a.estimatedDeliveryDate === null) return 1;
    if (b.estimatedDeliveryDate === null) return -1;
    return a.estimatedDeliveryDate < b.estimatedDeliveryDate ? -1 : 1;
  }
  const aTime = a.confirmedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bTime = b.confirmedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return a.orderLabel.localeCompare(b.orderLabel);
}

/**
 * Assigns finished-good stock, then what can still be produced with the available materials, to the
 * order lines by priority. Whatever is left is uncovered: it needs purchases.
 */
export function allocateCoverage(
  lines: readonly DemandLine[],
  stock: ReadonlyMap<string, bigint>,
  producible: ReadonlyMap<string, bigint>,
): LineCoverage[] {
  const remainingStock = new Map([...stock].map(([id, value]) => [id, max0(value)]));
  const remainingCapacity = new Map([...producible].map(([id, value]) => [id, max0(value)]));
  return [...lines].sort(byPriority).map((line) => {
    const fromStock = min(line.quantity, remainingStock.get(line.productId) ?? 0n);
    remainingStock.set(line.productId, (remainingStock.get(line.productId) ?? 0n) - fromStock);
    const rest = line.quantity - fromStock;
    const fromProduction = min(rest, remainingCapacity.get(line.productId) ?? 0n);
    remainingCapacity.set(
      line.productId,
      (remainingCapacity.get(line.productId) ?? 0n) - fromProduction,
    );
    const uncovered = rest - fromProduction;
    const status: CoverageStatus =
      uncovered > 0n ? 'SHORT' : fromProduction > 0n ? 'NEEDS_PRODUCTION' : 'COVERED';
    return { ...line, fromStock, fromProduction, uncovered, status };
  });
}

/** An order is as covered as its worst line. */
export function worstStatus(statuses: readonly CoverageStatus[]): CoverageStatus {
  if (statuses.includes('SHORT')) return 'SHORT';
  if (statuses.includes('NEEDS_PRODUCTION')) return 'NEEDS_PRODUCTION';
  return 'COVERED';
}

/** Batches needed for a bulk quantity (the last one may be partial). */
export function batches(quantity: bigint, capacity: bigint | null): number | null {
  if (capacity === null || capacity <= 0n || quantity <= 0n) return null;
  return Number((quantity + capacity - 1n) / capacity);
}

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

export interface StockSplit {
  /** Set aside for production orders already scheduled. */
  readonly forProduction: bigint;
  /** Needed by confirmed orders and not scheduled yet. */
  readonly forOrders: bigint;
  /** Nothing asks for it: idle stock. */
  readonly idle: bigint;
  /** Needed and not in stock (before what is on its way). */
  readonly missing: bigint;
}

/**
 * Splits the physical stock of one product by what it is for. Computed, never stored: scheduled
 * production takes first, then the rest of the confirmed demand, and whatever is left is idle.
 * `required` is the net need of the confirmed orders; `scheduled` is what planned orders will consume.
 */
export function splitStock(onHand: bigint, required: bigint, scheduled: bigint): StockSplit {
  const stock = max0(onHand);
  const forProduction = min(stock, min(scheduled, required));
  const forOrders = min(stock - forProduction, max0(required - forProduction));
  return {
    forProduction,
    forOrders,
    idle: stock - forProduction - forOrders,
    missing: max0(required - stock),
  };
}
