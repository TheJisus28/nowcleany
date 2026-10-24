import { ValidationError } from './errors.js';
import { BASE_UNIT, type Dimension, type UnitCode, unit } from './units.js';

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * An exact amount in the base unit of its dimension (mg, mL or un), held as bigint.
 * Never use `number` for quantities: converting to and from decimal strings goes through here.
 */
export class Quantity {
  private constructor(
    readonly base: bigint,
    readonly dimension: Dimension,
  ) {}

  static ofBase(base: bigint, dimension: Dimension): Quantity {
    return new Quantity(base, dimension);
  }

  static zero(dimension: Dimension): Quantity {
    return new Quantity(0n, dimension);
  }

  /** Parses a decimal string such as "2.5" expressed in `unitCode` ("kg", "L", ...). */
  static parse(value: string, unitCode: string): Quantity {
    const target = unit(unitCode);
    const match = DECIMAL.exec(value.trim());
    if (!match) {
      throw new ValidationError(
        'quantity.invalid_format',
        `"${value}" no es una cantidad válida; usa un número decimal con punto, por ejemplo "2.5".`,
        { value },
      );
    }
    const [, sign, integerPart = '0', fractionPart = ''] = match;
    const fraction = fractionPart.replace(/0+$/, '');
    if (fraction.length > target.scale) {
      throw new ValidationError(
        'quantity.too_many_decimals',
        `"${value}" tiene más decimales de los que admite la unidad ${target.code} (máximo ${String(target.scale)}).`,
        { value, unit: target.code, maxDecimals: target.scale },
      );
    }
    const magnitude =
      BigInt(integerPart) * target.factor +
      (fraction === '' ? 0n : BigInt(fraction.padEnd(target.scale, '0')));
    return new Quantity(sign ? -magnitude : magnitude, target.dimension);
  }

  get baseUnit(): UnitCode {
    return BASE_UNIT[this.dimension];
  }

  isZero(): boolean {
    return this.base === 0n;
  }

  isNegative(): boolean {
    return this.base < 0n;
  }

  isPositive(): boolean {
    return this.base > 0n;
  }

  add(other: Quantity): Quantity {
    this.assertSameDimension(other);
    return new Quantity(this.base + other.base, this.dimension);
  }

  subtract(other: Quantity): Quantity {
    this.assertSameDimension(other);
    return new Quantity(this.base - other.base, this.dimension);
  }

  negate(): Quantity {
    return new Quantity(-this.base, this.dimension);
  }

  /** Returns this quantity, or zero when it is negative. */
  clampToZero(): Quantity {
    return this.base < 0n ? Quantity.zero(this.dimension) : this;
  }

  compare(other: Quantity): -1 | 0 | 1 {
    this.assertSameDimension(other);
    if (this.base === other.base) return 0;
    return this.base < other.base ? -1 : 1;
  }

  /**
   * Multiplies by numerator/denominator rounding **up** (towards +∞) to the base unit.
   * Used for material requirements, where rounding down would under-buy.
   */
  scaleCeil(numerator: bigint, denominator: bigint): Quantity {
    if (denominator <= 0n) {
      throw new RangeError('denominator must be positive');
    }
    const product = this.base * numerator;
    const quotient = product / denominator;
    const roundsUp = product % denominator !== 0n && product > 0n;
    return new Quantity(roundsUp ? quotient + 1n : quotient, this.dimension);
  }

  /** Formats in `unitCode` with the minimum decimals needed, e.g. 147500 mL → "147.5" L. */
  format(unitCode: string): string {
    const target = unit(unitCode);
    if (target.dimension !== this.dimension) {
      throw new ValidationError(
        'quantity.incompatible_unit',
        `No se puede expresar una cantidad de ${this.baseUnit} en ${target.code}.`,
        { from: this.baseUnit, to: target.code },
      );
    }
    const negative = this.base < 0n;
    const magnitude = negative ? -this.base : this.base;
    const integerPart = magnitude / target.factor;
    const fraction = (magnitude % target.factor)
      .toString()
      .padStart(target.scale, '0')
      .replace(/0+$/, '');
    return `${negative ? '-' : ''}${integerPart.toString()}${fraction ? `.${fraction}` : ''}`;
  }

  private assertSameDimension(other: Quantity): void {
    if (other.dimension !== this.dimension) {
      throw new ValidationError(
        'quantity.dimension_mismatch',
        `No se pueden combinar cantidades de ${this.baseUnit} y ${other.baseUnit}.`,
      );
    }
  }
}
