import { ValidationError } from './errors.js';

export type Dimension = 'MASS' | 'VOLUME' | 'COUNT';

export const UNIT_CODES = ['kg', 'g', 'mg', 'L', 'mL', 'un'] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

export interface UnitDefinition {
  readonly code: UnitCode;
  readonly dimension: Dimension;
  /** How many base units (mg, mL, un) one unit holds. */
  readonly factor: bigint;
  /** Decimal places needed to express one base unit in this unit (log10 of factor). */
  readonly scale: number;
}

const UNITS: Record<UnitCode, UnitDefinition> = {
  kg: { code: 'kg', dimension: 'MASS', factor: 1_000_000n, scale: 6 },
  g: { code: 'g', dimension: 'MASS', factor: 1_000n, scale: 3 },
  mg: { code: 'mg', dimension: 'MASS', factor: 1n, scale: 0 },
  L: { code: 'L', dimension: 'VOLUME', factor: 1_000n, scale: 3 },
  mL: { code: 'mL', dimension: 'VOLUME', factor: 1n, scale: 0 },
  un: { code: 'un', dimension: 'COUNT', factor: 1n, scale: 0 },
};

export const BASE_UNIT: Record<Dimension, UnitCode> = { MASS: 'mg', VOLUME: 'mL', COUNT: 'un' };

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === 'string' && (UNIT_CODES as readonly string[]).includes(value);
}

export function unit(code: string): UnitDefinition {
  if (!isUnitCode(code)) {
    throw new ValidationError('quantity.unknown_unit', `Unidad desconocida: "${code}".`, {
      unit: code,
      allowed: UNIT_CODES,
    });
  }
  return UNITS[code];
}
