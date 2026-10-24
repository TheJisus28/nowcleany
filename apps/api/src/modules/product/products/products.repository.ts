import type { UnitCode } from '../../../shared-kernel/index.js';
import type { ProductType } from '../domain/product.js';

export interface ProductRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly stockUnit: UnitCode;
  readonly batchCapacity: bigint | null;
  readonly active: boolean;
  readonly activeFormulaVersion: number | null;
  readonly hasDraftFormula: boolean;
}

export interface ProductFilter {
  readonly type?: ProductType;
  readonly active?: boolean;
  readonly search?: string;
}

export interface NewProduct {
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly stockUnit: UnitCode;
  readonly batchCapacity: bigint | null;
}

export abstract class ProductsRepository {
  abstract findById(id: string): Promise<ProductRecord | undefined>;
  abstract findByIds(ids: readonly string[]): Promise<ProductRecord[]>;
  abstract findByCodes(codes: readonly string[]): Promise<ProductRecord[]>;
  abstract list(filter: ProductFilter): Promise<ProductRecord[]>;
  abstract insert(product: NewProduct): Promise<string>;
  abstract update(
    id: string,
    changes: { name?: string; batchCapacity?: bigint | null; active?: boolean },
  ): Promise<void>;
}
