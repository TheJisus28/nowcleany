import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.js';
import { Quantity } from '../quantity.js';

describe('Quantity', () => {
  it('parses decimal strings into exact base units', () => {
    expect(Quantity.parse('2.5', 'kg').base).toBe(2_500_000n);
    expect(Quantity.parse('147.5', 'L').base).toBe(147_500n);
    expect(Quantity.parse('0.001', 'L').base).toBe(1n);
    expect(Quantity.parse('12', 'un').base).toBe(12n);
    expect(Quantity.parse('-3.25', 'g').base).toBe(-3_250n);
    expect(Quantity.parse('1.500', 'L').base).toBe(1_500n);
  });

  it('rejects values finer than the base unit or badly formatted', () => {
    expect(() => Quantity.parse('0.0005', 'L')).toThrow(ValidationError);
    expect(() => Quantity.parse('1.5', 'un')).toThrow(/decimales/);
    expect(() => Quantity.parse('1,5', 'kg')).toThrow(/no es una cantidad válida/);
    expect(() => Quantity.parse('abc', 'kg')).toThrow(ValidationError);
    expect(() => Quantity.parse('1', 'lb')).toThrow(/Unidad desconocida/);
  });

  it('formats with the minimum decimals in the requested unit', () => {
    expect(Quantity.parse('147.5', 'L').format('L')).toBe('147.5');
    expect(Quantity.parse('101', 'L').format('L')).toBe('101');
    expect(Quantity.parse('1.25', 'kg').format('kg')).toBe('1.25');
    expect(Quantity.parse('1.25', 'kg').format('g')).toBe('1250');
    expect(Quantity.parse('-0.5', 'L').format('L')).toBe('-0.5');
    expect(() => Quantity.parse('1', 'L').format('kg')).toThrow(ValidationError);
  });

  it('scales rounding up, never down', () => {
    // 1000 bottles per batch of 1000 units, 1 % waste, for 250 units → 252.5 → 253.
    const bottles = Quantity.parse('1000', 'un');
    expect(bottles.scaleCeil(250n * 10_100n, 1_000n * 10_000n).base).toBe(253n);
    // Exact results are not bumped.
    const hypochlorite = Quantity.parse('400', 'L');
    expect(hypochlorite.scaleCeil(250n * 10_100n, 1_000n * 10_000n).format('L')).toBe('101');
    // Negative values round towards +∞ as well.
    expect(Quantity.ofBase(-5n, 'COUNT').scaleCeil(1n, 2n).base).toBe(-2n);
  });

  it('only combines quantities of the same dimension', () => {
    const liters = Quantity.parse('1', 'L');
    expect(liters.add(Quantity.parse('500', 'mL')).format('L')).toBe('1.5');
    expect(liters.subtract(Quantity.parse('2', 'L')).isNegative()).toBe(true);
    expect(() => liters.add(Quantity.parse('1', 'kg'))).toThrow(ValidationError);
    expect(Quantity.parse('-2', 'un').clampToZero().isZero()).toBe(true);
  });
});
