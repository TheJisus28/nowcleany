import { Quantity, ValidationError } from '../../../shared-kernel/index.js';

export const MOVEMENT_TYPES = [
  'INITIAL_LOAD',
  'RECEIPT',
  'PRODUCTION_OUTPUT',
  'PRODUCTION_CONSUMPTION',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'DISPATCH',
  'ADJUSTMENT',
  'WASTE',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  INITIAL_LOAD: 'Carga inicial',
  RECEIPT: 'Recepción',
  PRODUCTION_OUTPUT: 'Producción',
  PRODUCTION_CONSUMPTION: 'Consumo de producción',
  TRANSFER_OUT: 'Traslado (salida)',
  TRANSFER_IN: 'Traslado (entrada)',
  DISPATCH: 'Despacho',
  ADJUSTMENT: 'Ajuste',
  WASTE: 'Merma',
};

export const PLANT_WAREHOUSE = 'PLANTA';
export const DISPATCH_WAREHOUSE = 'DESPACHO';

export interface Balance {
  readonly onHand: bigint;
}

export function requirePositive(quantity: Quantity, what: string): Quantity {
  if (!quantity.isPositive()) {
    throw new ValidationError(
      'inventory.non_positive',
      `La cantidad de ${what} debe ser mayor que cero.`,
    );
  }
  return quantity;
}

/** A physical count sets the balance: the movement is the difference with the system figure. */
export function adjustmentDelta(currentOnHand: bigint, counted: Quantity): bigint {
  if (counted.isNegative()) {
    throw new ValidationError(
      'inventory.negative_count',
      'El conteo físico no puede ser negativo.',
    );
  }
  return counted.base - currentOnHand;
}

export function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    throw new ValidationError(
      'inventory.reason_required',
      'El ajuste requiere un motivo de al menos 5 caracteres (queda en la auditoría).',
    );
  }
  return trimmed;
}

export function requireDifferentWarehouses(from: string, to: string): void {
  if (from === to) {
    throw new ValidationError(
      'inventory.same_warehouse',
      'La bodega de origen y la de destino deben ser distintas.',
    );
  }
}
