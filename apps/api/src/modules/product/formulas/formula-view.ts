import { type QuantityDto, toQuantityDto } from '../../../shared-kernel/index.js';
import type { FormulaStatus } from '../domain/formula.js';
import { PRODUCT_TYPE_LABELS, type ProductType } from '../domain/product.js';
import type { ProductRecord } from '../products/products.repository.js';
import type { FormulaRecord } from './formulas.repository.js';

export interface FormulaLineView {
  readonly componentId: string;
  readonly componentCode: string;
  readonly componentName: string;
  readonly componentType: ProductType;
  readonly componentTypeLabel: string;
  readonly quantity: QuantityDto;
}

export interface FormulaView {
  readonly id: string;
  readonly productId: string;
  readonly version: number;
  readonly status: FormulaStatus;
  readonly batchYield: QuantityDto;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
  readonly createdAt: string;
  readonly publishedBy: { id: string; name: string } | null;
  readonly publishedAt: string | null;
  readonly retiredAt: string | null;
  readonly lines: readonly FormulaLineView[];
}

export function toFormulaView(
  formula: FormulaRecord,
  product: ProductRecord,
  components: ReadonlyMap<string, ProductRecord>,
): FormulaView {
  return {
    id: formula.id,
    productId: formula.productId,
    version: formula.version,
    status: formula.status,
    batchYield: toQuantityDto(formula.batchYield, product.stockUnit),
    notes: formula.notes,
    createdBy: { id: formula.createdBy, name: formula.createdByName },
    createdAt: formula.createdAt.toISOString(),
    publishedBy:
      formula.publishedBy === null
        ? null
        : { id: formula.publishedBy, name: formula.publishedByName ?? '' },
    publishedAt: formula.publishedAt?.toISOString() ?? null,
    retiredAt: formula.retiredAt?.toISOString() ?? null,
    lines: formula.lines.map((line) => {
      const component = components.get(line.componentId);
      if (!component) throw new Error(`Componente ${line.componentId} no encontrado`);
      return {
        componentId: component.id,
        componentCode: component.code,
        componentName: component.name,
        componentType: component.type,
        componentTypeLabel: PRODUCT_TYPE_LABELS[component.type],
        quantity: toQuantityDto(line.quantity, component.stockUnit),
      };
    }),
  };
}
