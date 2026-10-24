import { ConflictError, type Quantity, ValidationError } from '../../../shared-kernel/index.js';

export const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'DISPATCHED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  DISPATCHED: 'Despachado',
  CANCELLED: 'Anulado',
};

export function orderLabel(number: bigint | number): string {
  return `PV-${number.toString().padStart(5, '0')}`;
}

export interface OrderLineCandidate {
  readonly product: { id: string; code: string; type: string; active: boolean };
  readonly quantity: Quantity;
}

/** Pre-sales are made of active finished goods, each product once, with positive quantities. */
export function validateLines(lines: readonly OrderLineCandidate[]): void {
  if (lines.length === 0) {
    throw new ValidationError('sales.no_lines', 'La preventa debe tener al menos un producto.');
  }
  const seen = new Set<string>();
  for (const { product, quantity } of lines) {
    if (product.type !== 'FINISHED_GOOD') {
      throw new ValidationError(
        'sales.not_finished_good',
        `${product.code} no es un producto terminado; solo se venden productos terminados.`,
      );
    }
    if (!product.active) {
      throw new ValidationError('sales.inactive_product', `${product.code} está desactivado.`);
    }
    if (!quantity.isPositive()) {
      throw new ValidationError(
        'sales.non_positive_quantity',
        `La cantidad de ${product.code} debe ser mayor que cero.`,
      );
    }
    if (seen.has(product.id)) {
      throw new ValidationError(
        'sales.duplicate_product',
        `${product.code} aparece más de una vez; suma las cantidades en una sola línea.`,
      );
    }
    seen.add(product.id);
  }
}

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: [],
  CANCELLED: [],
};

const TRANSITION_ERRORS: Record<OrderStatus, string> = {
  DRAFT: 'Una preventa no puede volver a borrador.',
  CONFIRMED: 'Solo se puede confirmar una preventa en borrador.',
  DISPATCHED: 'Solo se puede despachar una preventa confirmada.',
  CANCELLED: 'Solo se puede anular una preventa en borrador o confirmada.',
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ConflictError('sales.invalid_transition', TRANSITION_ERRORS[to], { from, to });
  }
}

export function assertEditable(status: OrderStatus): void {
  if (status !== 'DRAFT') {
    throw new ConflictError(
      'sales.not_editable',
      'Solo se puede modificar una preventa en borrador.',
    );
  }
}

export function requireCancelReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new ValidationError('sales.cancel_reason_required', 'Indica el motivo de la anulación.');
  }
  return trimmed;
}

/** ISO date "YYYY-MM-DD" that exists in the calendar. */
export function parseDeliveryDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(`${value}T00:00:00Z`) : undefined;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(
      'sales.invalid_delivery_date',
      'La fecha estimada de entrega no es válida (AAAA-MM-DD).',
    );
  }
  return value;
}
