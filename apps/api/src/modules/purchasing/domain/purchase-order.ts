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

export interface SupplierData {
  readonly documentNumber: string | null;
  readonly name: string;
  readonly contact: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly city: string | null;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  return trimmed === '' ? null : trimmed;
};

export function normalizeSupplier(input: {
  documentNumber?: string | null | undefined;
  name: string;
  contact?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  city?: string | null | undefined;
}): SupplierData {
  const name = clean(input.name) ?? '';
  if (name.length < 2 || name.length > 160) {
    throw new ValidationError(
      'purchasing.invalid_supplier',
      'El nombre del proveedor debe tener entre 2 y 160 caracteres.',
    );
  }
  const documentNumber = clean(input.documentNumber)?.replace(/[\s.]/g, '') ?? null;
  if (documentNumber !== null && !/^\d{6,12}(-\d)?$/.test(documentNumber)) {
    throw new ValidationError('purchasing.invalid_document', 'El NIT del proveedor no es válido.');
  }
  const email = clean(input.email)?.toLowerCase() ?? null;
  if (email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError('purchasing.invalid_email', 'El correo del proveedor no es válido.');
  }
  return {
    documentNumber,
    name,
    contact: clean(input.contact),
    phone: clean(input.phone),
    email,
    city: clean(input.city),
  };
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
