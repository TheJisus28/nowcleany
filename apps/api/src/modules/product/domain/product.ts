import {
  type Dimension,
  Quantity,
  type UnitCode,
  unit,
  ValidationError,
} from '../../../shared-kernel/index.js';

/** RESALE: bought from suppliers and sold as is (brooms, dustpans…), no formula. */
export const PRODUCT_TYPES = ['RAW_MATERIAL', 'BULK', 'FINISHED_GOOD', 'RESALE'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  RAW_MATERIAL: 'Materia prima',
  BULK: 'Granel',
  FINISHED_GOOD: 'Producto terminado',
  RESALE: 'Mercancía de reventa',
};

/** What can be sold to customers. */
export const SELLABLE_TYPES: readonly ProductType[] = ['FINISHED_GOOD', 'RESALE'];
/** What can be bought from suppliers. */
export const PURCHASABLE_TYPES: readonly ProductType[] = ['RAW_MATERIAL', 'RESALE'];

const CODE = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;

export function normalizeCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!CODE.test(code)) {
    throw new ValidationError(
      'product.invalid_code',
      `El código "${raw}" no es válido: usa letras, números, punto, guion o guion bajo (máximo 40).`,
    );
  }
  return code;
}

export function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 160) {
    throw new ValidationError(
      'product.invalid_name',
      'El nombre debe tener entre 2 y 160 caracteres.',
    );
  }
  return name;
}

/** Only bulk liquids have a batch capacity (e.g. the chlorine batch makes up to 25 000 L). */
export function parseBatchCapacity(
  type: ProductType,
  stockUnit: string,
  value: string | undefined,
): Quantity | null {
  if (value === undefined || value.trim() === '') return null;
  if (type !== 'BULK') {
    throw new ValidationError(
      'product.batch_capacity_not_allowed',
      'Solo los productos a granel tienen capacidad de bache.',
    );
  }
  const capacity = Quantity.parse(value, stockUnit);
  if (!capacity.isPositive()) {
    throw new ValidationError(
      'product.invalid_batch_capacity',
      'La capacidad de bache debe ser mayor que cero.',
    );
  }
  return capacity;
}

export function dimensionOf(stockUnit: string): Dimension {
  return unit(stockUnit).dimension;
}

const TYPE_ALIASES: Record<string, ProductType> = {
  'materia prima': 'RAW_MATERIAL',
  materia_prima: 'RAW_MATERIAL',
  mp: 'RAW_MATERIAL',
  raw_material: 'RAW_MATERIAL',
  insumo: 'RAW_MATERIAL',
  granel: 'BULK',
  bulk: 'BULK',
  terminado: 'FINISHED_GOOD',
  'producto terminado': 'FINISHED_GOOD',
  pt: 'FINISHED_GOOD',
  finished_good: 'FINISHED_GOOD',
  reventa: 'RESALE',
  mercancia: 'RESALE',
  mercancía: 'RESALE',
  resale: 'RESALE',
};

const UNIT_ALIASES: Record<string, UnitCode> = {
  kg: 'kg',
  g: 'g',
  gr: 'g',
  mg: 'mg',
  l: 'L',
  lt: 'L',
  litro: 'L',
  litros: 'L',
  ml: 'mL',
  un: 'un',
  und: 'un',
  unidad: 'un',
  unidades: 'un',
};

/** Accepts the Spanish words people write in spreadsheets ("Materia prima", "granel", "PT"). */
export function parseProductType(raw: string): ProductType {
  const type = TYPE_ALIASES[raw.trim().toLowerCase()];
  if (!type) {
    throw new ValidationError(
      'product.invalid_type',
      `Tipo de producto desconocido: "${raw}". Usa materia prima, granel o terminado.`,
    );
  }
  return type;
}

export function parseUnitCode(raw: string): UnitCode {
  const code = UNIT_ALIASES[raw.trim().toLowerCase()];
  if (!code) {
    throw new ValidationError(
      'product.invalid_unit',
      `Unidad desconocida: "${raw}". Usa kg, g, mg, L, mL o un.`,
    );
  }
  return code;
}
