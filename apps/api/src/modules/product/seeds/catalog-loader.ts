import { Injectable } from '@nestjs/common';
import type { ProductType } from '../domain/product.js';
import { FormulasService } from '../formulas/formulas.service.js';
import { ProductsRepository } from '../products/products.repository.js';
import { ProductsService } from '../products/products.service.js';

export interface SeedProduct {
  code: string;
  name: string;
  type: ProductType;
  unit: string;
  batchCapacity?: string;
}

export interface SeedFormula {
  product: string;
  batchYield: string;
  lines: { component: string; quantity: string }[];
}

/** Loads example products and publishes their formulas through the catalog's own services. */
@Injectable()
export class CatalogLoader {
  constructor(
    private readonly products: ProductsService,
    private readonly repository: ProductsRepository,
    private readonly formulas: FormulasService,
  ) {}

  /** Idempotent: creates the missing products and publishes a formula only where none is active. */
  async load(products: readonly SeedProduct[], formulas: readonly SeedFormula[]): Promise<void> {
    const existing = new Set(
      (await this.repository.findByCodes(products.map((p) => p.code))).map((p) => p.code),
    );
    for (const product of products) {
      if (existing.has(product.code)) continue;
      await this.products.create({
        code: product.code,
        name: product.name,
        type: product.type,
        stockUnit: product.unit,
        ...(product.batchCapacity ? { batchCapacity: product.batchCapacity } : {}),
      });
    }
    // Formulas may use components loaded earlier (by another seed).
    const codes = new Set([
      ...products.map((p) => p.code),
      ...formulas.flatMap((f) => [f.product, ...f.lines.map((line) => line.component)]),
    ]);
    const byCode = new Map((await this.repository.findByCodes([...codes])).map((p) => [p.code, p]));
    const id = (code: string): string => {
      const product = byCode.get(code);
      if (!product) throw new Error(`Producto de ejemplo ${code} no encontrado`);
      return product.id;
    };
    for (const formula of formulas) {
      if (byCode.get(formula.product)?.activeFormulaVersion !== null) continue;
      const draft = await this.formulas.saveDraft(id(formula.product), {
        batchYield: formula.batchYield,
        notes: 'Fórmula de ejemplo (datos ilustrativos para la demo).',
        lines: formula.lines.map((line) => ({
          componentId: id(line.component),
          quantity: line.quantity,
        })),
      });
      await this.formulas.publish(draft.id);
    }
  }
}
