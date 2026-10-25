import { describe, expect, it } from 'vitest';
import {
  allocateCoverage,
  type DemandLine,
  net,
  splitStock,
  worstStatus,
} from '../domain/planning.js';

const line = (
  orderLabel: string,
  sellerName: string,
  quantity: bigint,
  estimatedDeliveryDate: string | null,
): DemandLine => ({
  orderId: orderLabel,
  orderLabel,
  customerId: 'c1',
  customerName: 'Cliente',
  sellerId: sellerName,
  sellerName,
  estimatedDeliveryDate,
  confirmedAt: new Date('2026-10-20T10:00:00Z'),
  productId: 'box',
  quantity,
});

describe('net requirements', () => {
  it('nets gross needs against usable stock and what is already on its way', () => {
    expect(net(17_877n, 12_120n)).toBe(5_757n);
    expect(net(100n, 30n, 50n)).toBe(20n);
    expect(net(100n, 200n)).toBe(0n);
    // Negative physical stock never inflates the need (it would mean buying twice).
    expect(net(100n, -20n)).toBe(100n);
  });
});

describe('coverage of the proposal example (illustrative figures)', () => {
  // Three sellers pre-sold 2 950 boxes; stock 0; materials allow 2 000 boxes.
  const lines = [
    line('PV-00003', 'Vendedor C', 950n, '2026-11-10'),
    line('PV-00001', 'Vendedor A', 1_200n, '2026-11-03'),
    line('PV-00002', 'Vendedor B', 800n, '2026-11-05'),
  ];
  const coverage = allocateCoverage(lines, new Map([['box', 0n]]), new Map([['box', 2_000n]]));

  it('serves the earliest delivery dates first and leaves 950 boxes uncovered', () => {
    expect(
      coverage.map((c) => [c.orderLabel, c.fromStock, c.fromProduction, c.uncovered, c.status]),
    ).toEqual([
      ['PV-00001', 0n, 1_200n, 0n, 'NEEDS_PRODUCTION'],
      ['PV-00002', 0n, 800n, 0n, 'NEEDS_PRODUCTION'],
      ['PV-00003', 0n, 0n, 950n, 'SHORT'],
    ]);
    expect(coverage.reduce((sum, c) => sum + c.uncovered, 0n)).toBe(950n);
  });

  it('uses finished stock before production, and an order is as covered as its worst line', () => {
    const [first, second] = allocateCoverage(
      [line('PV-1', 'A', 30n, '2026-11-01'), line('PV-2', 'A', 30n, '2026-11-02')],
      new Map([['box', 40n]]),
      new Map([['box', 10n]]),
    );
    expect([first?.fromStock, first?.status]).toEqual([30n, 'COVERED']);
    expect([second?.fromStock, second?.fromProduction, second?.uncovered]).toEqual([10n, 10n, 10n]);
    expect(worstStatus(['COVERED', 'NEEDS_PRODUCTION'])).toBe('NEEDS_PRODUCTION');
    expect(worstStatus(['COVERED', 'SHORT', 'NEEDS_PRODUCTION'])).toBe('SHORT');
  });
});

describe('stock split', () => {
  it('sets stock aside for scheduled production first, then orders; the rest is idle', () => {
    expect(splitStock(1000n, 700n, 300n)).toEqual({
      forProduction: 300n,
      forOrders: 400n,
      idle: 300n,
      missing: 0n,
    });
    expect(splitStock(-50n, 400n, 100n)).toEqual({
      forProduction: 0n,
      forOrders: 0n,
      idle: 0n,
      missing: 400n,
    });
  });
});
