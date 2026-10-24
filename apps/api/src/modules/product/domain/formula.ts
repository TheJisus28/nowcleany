import {
  ConflictError,
  type Dimension,
  ForbiddenError,
  Quantity,
  ValidationError,
} from '../../../shared-kernel/index.js';
import type { ProductType } from './product.js';

export const FORMULA_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type FormulaStatus = (typeof FORMULA_STATUSES)[number];

const BPS = 10_000n;
export const MAX_WASTE_BPS = 10_000;

export interface FormulaProduct {
  readonly id: string;
  readonly code: string;
  readonly type: ProductType;
  readonly dimension: Dimension;
  readonly active: boolean;
}

export interface FormulaLine {
  readonly componentId: string;
  /** Per batch, in the component's base unit. */
  readonly quantity: Quantity;
  /** Basis points: 100 = 1 %. */
  readonly wasteBps: number;
}

export interface FormulaDefinition {
  /** Units of the product one batch yields, in the product's base unit. */
  readonly batchYield: Quantity;
  readonly lines: readonly FormulaLine[];
}

/** Which component types each kind of formula may use (two levels, no cycles). */
const ALLOWED_COMPONENTS: Record<ProductType, readonly ProductType[]> = {
  RAW_MATERIAL: [],
  BULK: ['RAW_MATERIAL'],
  FINISHED_GOOD: ['BULK', 'RAW_MATERIAL'],
};

export function validateFormula(
  product: FormulaProduct,
  definition: FormulaDefinition,
  components: ReadonlyMap<string, FormulaProduct>,
): void {
  const allowed = ALLOWED_COMPONENTS[product.type];
  if (allowed.length === 0) {
    throw new ValidationError(
      'formula.not_allowed',
      'Las materias primas no tienen fórmula; solo los productos a granel y los terminados.',
    );
  }
  if (
    definition.batchYield.dimension !== product.dimension ||
    !definition.batchYield.isPositive()
  ) {
    throw new ValidationError(
      'formula.invalid_yield',
      'El rendimiento del bache debe ser mayor que cero y estar en la unidad del producto.',
    );
  }
  if (definition.lines.length === 0) {
    throw new ValidationError('formula.no_lines', 'La fórmula debe tener al menos un componente.');
  }

  const seen = new Set<string>();
  for (const line of definition.lines) {
    const component = components.get(line.componentId);
    if (!component) {
      throw new ValidationError('formula.unknown_component', 'Uno de los componentes no existe.', {
        componentId: line.componentId,
      });
    }
    if (component.id === product.id) {
      throw new ValidationError(
        'formula.self_reference',
        'Un producto no puede ser componente de sí mismo.',
      );
    }
    if (seen.has(component.id)) {
      throw new ValidationError(
        'formula.duplicate_component',
        `El componente ${component.code} aparece más de una vez.`,
      );
    }
    seen.add(component.id);
    if (!allowed.includes(component.type)) {
      throw new ValidationError(
        'formula.component_type_not_allowed',
        product.type === 'BULK'
          ? `La fórmula de un granel solo puede usar materias primas (${component.code} no lo es).`
          : `${component.code} no puede ser componente de un producto terminado.`,
      );
    }
    if (!component.active) {
      throw new ValidationError(
        'formula.inactive_component',
        `El componente ${component.code} está desactivado.`,
      );
    }
    if (line.quantity.dimension !== component.dimension || !line.quantity.isPositive()) {
      throw new ValidationError(
        'formula.invalid_quantity',
        `La cantidad de ${component.code} debe ser mayor que cero y estar en una unidad compatible.`,
      );
    }
    if (!Number.isInteger(line.wasteBps) || line.wasteBps < 0 || line.wasteBps > MAX_WASTE_BPS) {
      throw new ValidationError(
        'formula.invalid_waste',
        `La merma de ${component.code} debe estar entre 0 y 10000 puntos básicos (0 % a 100 %).`,
      );
    }
  }
}

/**
 * Component quantities needed to make `quantity` of the product:
 * line × quantity × (1 + waste) / batchYield, rounded **up** to the component's base unit.
 */
export function requirements(
  definition: FormulaDefinition,
  quantity: Quantity,
): { componentId: string; quantity: Quantity }[] {
  if (quantity.dimension !== definition.batchYield.dimension) {
    throw new ValidationError(
      'formula.incompatible_quantity',
      'La cantidad pedida no está en la unidad del producto.',
    );
  }
  return definition.lines.map((line) => ({
    componentId: line.componentId,
    quantity: line.quantity.scaleCeil(
      quantity.base * (BPS + BigInt(line.wasteBps)),
      definition.batchYield.base * BPS,
    ),
  }));
}

/** Four-eyes rule: whoever wrote the draft cannot publish it, unless allowed to publish their own. */
export function assertCanPublish(
  formula: { status: FormulaStatus; createdBy: string },
  publisher: { id: string; canPublishOwn: boolean },
): void {
  if (formula.status !== 'DRAFT') {
    throw new ConflictError('formula.not_draft', 'Solo se puede publicar una fórmula en borrador.');
  }
  if (formula.createdBy === publisher.id && !publisher.canPublishOwn) {
    throw new ForbiddenError(
      'formula.four_eyes',
      'Quien define la fórmula no puede publicarla: debe hacerlo otra persona (regla de cuatro ojos).',
    );
  }
}

/**
 * Largest quantity of the product that the available components allow, and the component that limits it.
 * Exact inverse of `requirements`: ceil(line × q × (1 + waste) / yield) ≤ available
 * ⇔ q ≤ available × yield / (line × (1 + waste)).
 */
export function maxProducible(
  definition: FormulaDefinition,
  available: (componentId: string) => bigint,
): { quantity: bigint; limitingComponentId: string | null } {
  let best: { quantity: bigint; limitingComponentId: string | null } | undefined;
  for (const line of definition.lines) {
    const stock = available(line.componentId);
    const usable = stock > 0n ? stock : 0n;
    const quantity =
      (usable * definition.batchYield.base * BPS) /
      (line.quantity.base * (BPS + BigInt(line.wasteBps)));
    if (!best || quantity < best.quantity)
      best = { quantity, limitingComponentId: line.componentId };
  }
  return best ?? { quantity: 0n, limitingComponentId: null };
}
