import type { OrderCoverage, Q, SalesOrder } from '../../api/types';
import { compareDecimals, isPositive, minDecimal, subtractDecimals } from './decimal';

/** A line still to ship, against what today's stock covers following the consolidator's priority. */
export interface PrepLine {
  productId: string;
  code: string;
  name: string;
  ordered: Q;
  dispatched: Q;
  pending: Q;
  available: Q;
  missing: Q;
  coverage: OrderCoverage['lines'][number] | undefined;
}

export interface PrepOrder {
  order: SalesOrder;
  lines: PrepLine[];
  complete: boolean;
  someAvailable: boolean;
  rank: number;
}

export type Readiness = 'complete' | 'partial' | 'waiting';

export const READINESS_LABEL: Record<Readiness, string> = {
  complete: 'Todo disponible',
  partial: 'Disponible una parte',
  waiting: 'Espera fabricación',
};

export const readiness = (row: PrepOrder): Readiness =>
  row.complete ? 'complete' : row.order.allowPartial && row.someAvailable ? 'partial' : 'waiting';

export function buildPrepOrder(order: SalesOrder, coverage: OrderCoverage | undefined): PrepOrder {
  const lines = order.lines
    .filter((line) => isPositive(line.pending.quantity))
    .map((line) => {
      const coverageLine = coverage?.lines.find((item) => item.product.id === line.productId);
      const available = minDecimal(coverageLine?.fromStock.quantity ?? '0', line.pending.quantity);
      return {
        productId: line.productId,
        code: line.productCode,
        name: line.productName,
        ordered: line.quantity,
        dispatched: line.dispatched,
        pending: line.pending,
        available: { quantity: available, unit: line.pending.unit },
        missing: {
          quantity: subtractDecimals(line.pending.quantity, available),
          unit: line.pending.unit,
        },
        coverage: coverageLine,
      };
    });
  return {
    order,
    lines,
    complete:
      lines.length > 0 &&
      lines.every((line) => compareDecimals(line.available.quantity, line.pending.quantity) >= 0),
    someAvailable: lines.some((line) => isPositive(line.available.quantity)),
    rank: coverage?.priority ?? 9999,
  };
}

/** Orders to prepare in the consolidator's priority, then coverage rank, then promised date. */
export function buildPrepOrders(orders: SalesOrder[], coverage: OrderCoverage[]): PrepOrder[] {
  const byOrder = new Map(coverage.map((entry) => [entry.orderId, entry]));
  return orders
    .map((order) => buildPrepOrder(order, byOrder.get(order.id)))
    .filter((row) => row.lines.length > 0)
    .sort(
      (a, b) =>
        (a.order.priority ?? 9999) - (b.order.priority ?? 9999) ||
        a.rank - b.rank ||
        (a.order.estimatedDeliveryDate ?? '9').localeCompare(b.order.estimatedDeliveryDate ?? '9'),
    );
}
