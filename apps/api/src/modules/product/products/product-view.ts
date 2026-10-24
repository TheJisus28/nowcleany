import { type QuantityDto, toQuantityDto, type UnitCode } from '../../../shared-kernel/index.js';
import { PRODUCT_TYPE_LABELS, type ProductType } from '../domain/product.js';
import type { ProductRecord } from './products.repository.js';

export interface ProductView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly typeLabel: string;
  readonly stockUnit: UnitCode;
  readonly batchCapacity: QuantityDto | null;
  readonly active: boolean;
  readonly activeFormulaVersion: number | null;
  readonly hasDraftFormula: boolean;
}

export function toProductView(product: ProductRecord): ProductView {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    type: product.type,
    typeLabel: PRODUCT_TYPE_LABELS[product.type],
    stockUnit: product.stockUnit,
    batchCapacity:
      product.batchCapacity === null
        ? null
        : toQuantityDto(product.batchCapacity, product.stockUnit),
    active: product.active,
    activeFormulaVersion: product.activeFormulaVersion,
    hasDraftFormula: product.hasDraftFormula,
  };
}
