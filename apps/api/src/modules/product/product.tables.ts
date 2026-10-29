import type { Generated } from 'kysely';
import type { UnitCode } from '../../shared-kernel/index.js';
import type { FormulaStatus } from './domain/formula.js';
import type { ProductType } from './domain/product.js';

export interface ProductTables {
  products: {
    id: Generated<string>;
    code: string;
    name: string;
    type: ProductType;
    stock_unit: UnitCode;
    batch_capacity: bigint | null;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  formulas: {
    id: Generated<string>;
    product_id: string;
    version: number;
    status: FormulaStatus;
    batch_yield: bigint;
    notes: string | null;
    created_by: string;
    created_by_name: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    published_by: string | null;
    published_by_name: string | null;
    published_at: Date | null;
    retired_at: Date | null;
  };
  formula_lines: {
    formula_id: string;
    line_no: number;
    component_id: string;
    quantity: bigint;
  };
}
