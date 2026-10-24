import { ConflictError, ValidationError } from '../../../shared-kernel/index.js';

export const PRODUCTION_STATUSES = ['PLANNED', 'COMPLETED', 'CANCELLED'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export type ProducibleType = 'BULK' | 'FINISHED_GOOD';

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  PLANNED: 'Programada',
  COMPLETED: 'Terminada',
  CANCELLED: 'Anulada',
};

/** Bulk orders make liquid in batches; finished-good orders package it. */
export const PRODUCTION_KIND_LABELS: Record<ProducibleType, string> = {
  BULK: 'Producción de granel',
  FINISHED_GOOD: 'Envasado',
};

export function productionLabel(number: bigint | number): string {
  return `OP-${number.toString().padStart(5, '0')}`;
}

export function assertProducible(product: {
  code: string;
  type: string;
  active: boolean;
}): ProducibleType {
  if (product.type !== 'BULK' && product.type !== 'FINISHED_GOOD') {
    throw new ValidationError(
      'production.not_producible',
      `${product.code} es materia prima: solo se producen graneles o se envasan terminados.`,
    );
  }
  if (!product.active) {
    throw new ValidationError('production.inactive_product', `${product.code} está desactivado.`);
  }
  return product.type;
}

/** Batches needed for a bulk quantity (the last one may be partial). */
export function batchesFor(quantity: bigint, batchCapacity: bigint | null): number | null {
  if (batchCapacity === null || batchCapacity <= 0n) return null;
  return Number((quantity + batchCapacity - 1n) / batchCapacity);
}

export function assertPlanned(status: ProductionStatus, action: 'complete' | 'cancel'): void {
  if (status !== 'PLANNED') {
    throw new ConflictError(
      'production.not_planned',
      action === 'complete'
        ? 'Solo se puede terminar una orden programada.'
        : 'Solo se puede anular una orden programada.',
    );
  }
}
