import { ValidationError } from '../../../shared-kernel/index.js';

/** NIT: a company (its name is the "razón social"); CC: a person (cédula, the name is the person's). */
export const DOCUMENT_TYPES = ['NIT', 'CC'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  NIT: 'NIT',
  CC: 'Cédula',
};

export interface CustomerData {
  readonly documentType: DocumentType;
  readonly documentNumber: string;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly city: string | null;
}

export interface BranchData {
  readonly name: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly phone: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

const clean = (value: string | undefined | null): string | null => {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  return trimmed === '' ? null : trimmed;
};

export function normalizeCustomer(input: {
  documentType: DocumentType;
  documentNumber: string;
  name: string;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  city?: string | null | undefined;
}): CustomerData {
  const name = clean(input.name) ?? '';
  if (name.length < 2 || name.length > 160) {
    throw new ValidationError(
      'sales.invalid_customer_name',
      input.documentType === 'NIT'
        ? 'La razón social debe tener entre 2 y 160 caracteres.'
        : 'El nombre debe tener entre 2 y 160 caracteres.',
    );
  }
  // As typed, without spaces or dots: "900.123.456-7" → "900123456-7".
  const documentNumber = input.documentNumber.replace(/[\s.]/g, '').toUpperCase();
  const valid =
    input.documentType === 'NIT'
      ? /^\d{6,12}(-\d)?$/.test(documentNumber)
      : /^\d{5,12}$/.test(documentNumber);
  if (!valid) {
    throw new ValidationError(
      'sales.invalid_document',
      input.documentType === 'NIT'
        ? 'El NIT no es válido (números, con dígito de verificación opcional: 900123456-7).'
        : 'La cédula no es válida (solo números).',
    );
  }
  return {
    documentType: input.documentType,
    documentNumber,
    name,
    address: clean(input.address),
    phone: clean(input.phone),
    city: clean(input.city),
  };
}

export function normalizeBranch(input: {
  name: string;
  address?: string | null | undefined;
  city?: string | null | undefined;
  phone?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
}): BranchData {
  const name = clean(input.name) ?? '';
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError(
      'sales.invalid_branch_name',
      'El nombre de la sucursal debe tener entre 2 y 80 caracteres.',
    );
  }
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  if ((latitude === null) !== (longitude === null)) {
    throw new ValidationError(
      'sales.invalid_location',
      'La ubicación necesita latitud y longitud.',
    );
  }
  if (
    latitude !== null &&
    longitude !== null &&
    (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
  ) {
    throw new ValidationError('sales.invalid_location', 'La ubicación no es válida.');
  }
  return {
    name,
    address: clean(input.address),
    city: clean(input.city),
    phone: clean(input.phone),
    latitude,
    longitude,
  };
}
