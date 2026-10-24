import { ValidationError } from '../../../shared-kernel/index.js';

export interface CustomerData {
  readonly name: string;
  readonly taxId: string | null;
  readonly phone: string | null;
  readonly city: string | null;
}

const clean = (value: string | undefined | null): string | null => {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  return trimmed === '' ? null : trimmed;
};

export function normalizeCustomer(input: {
  name: string;
  taxId?: string | null;
  phone?: string | null;
  city?: string | null;
}): CustomerData {
  const name = clean(input.name) ?? '';
  if (name.length < 2 || name.length > 160) {
    throw new ValidationError(
      'sales.invalid_customer_name',
      'El nombre del cliente debe tener entre 2 y 160 caracteres.',
    );
  }
  // NIT as typed, without spaces or dots: "900.123.456-7" → "900123456-7".
  const taxId = clean(input.taxId)?.replace(/[\s.]/g, '').toUpperCase() ?? null;
  if (taxId !== null && !/^[0-9A-Z-]{5,20}$/.test(taxId)) {
    throw new ValidationError('sales.invalid_tax_id', 'El NIT o documento no es válido.');
  }
  return { name, taxId, phone: clean(input.phone), city: clean(input.city) };
}
