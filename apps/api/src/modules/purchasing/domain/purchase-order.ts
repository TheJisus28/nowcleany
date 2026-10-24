import { ConflictError, type Quantity, ValidationError } from '../../../shared-kernel/index.js';

export const PURCHASE_STATUSES = ['OPEN', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  OPEN: 'En tránsito',
  RECEIVED: 'Recibida',
  CANCELLED: 'Anulada',
};

export function purchaseLabel(number: bigint | number): string {
  return `OC-${number.toString().padStart(5, '0')}`;
}

export function normalizeSupplier(raw: string): string {
  const supplier = raw.trim().replace(/\s+/g, ' ');
  if (supplier.length < 2 || supplier.length > 160) {
    throw new ValidationError(
      'purchasing.invalid_supplier',
      'El proveedor debe tener entre 2 y 160 caracteres.',
    );
  }
  return supplier;
}

/** Only raw materials are purchased; each once per order, with positive quantities. */
export function validatePurchaseLines(
  lines: readonly {
    product: { id: string; code: string; type: string; active: boolean };
    quantity: Quantity;
  }[],
): void {
  if (lines.length === 0) {
    throw new ValidationError(
      'purchasing.no_lines',
      'La orden de compra debe tener al menos una línea.',
    );
  }
  const seen = new Set<string>();
  for (const { product, quantity } of lines) {
    if (product.type !== 'RAW_MATERIAL') {
      throw new ValidationError(
        'purchasing.not_raw_material',
        `${product.code} no es materia prima; solo se compran materias primas.`,
      );
    }
    if (!product.active) {
      throw new ValidationError('purchasing.inactive_product', `${product.code} está desactivado.`);
    }
    if (!quantity.isPositive()) {
      throw new ValidationError(
        'purchasing.non_positive_quantity',
        `La cantidad de ${product.code} debe ser mayor que cero.`,
      );
    }
    if (seen.has(product.id)) {
      throw new ValidationError(
        'purchasing.duplicate_product',
        `${product.code} aparece más de una vez en la orden.`,
      );
    }
    seen.add(product.id);
  }
}

export function assertOpen(status: PurchaseStatus, action: 'receive' | 'cancel'): void {
  if (status !== 'OPEN') {
    throw new ConflictError(
      'purchasing.not_open',
      action === 'receive'
        ? 'Solo se puede recibir una orden en tránsito.'
        : 'Solo se puede anular una orden en tránsito.',
    );
  }
}
