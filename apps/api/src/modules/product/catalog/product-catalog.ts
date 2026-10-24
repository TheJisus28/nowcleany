import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { Quantity, type UnitCode } from '../../../shared-kernel/index.js';
import { type FormulaDefinition, requirements } from '../domain/formula.js';
import { dimensionOf, type ProductType } from '../domain/product.js';
import type { FormulaRecord } from '../formulas/formulas.repository.js';
import { FormulasRepository } from '../formulas/formulas.repository.js';
import type { ProductRecord } from '../products/products.repository.js';
import { ProductsRepository } from '../products/products.repository.js';

export interface ProductSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly stockUnit: UnitCode;
  readonly active: boolean;
  /** Base units; bulk products only. */
  readonly batchCapacity: bigint | null;
}

export interface ComponentNeed {
  readonly componentId: string;
  /** Base units of the component. */
  readonly quantity: bigint;
}

export interface RequirementsResult {
  /** Aggregated by component. */
  readonly needs: readonly ComponentNeed[];
  /** Products asked for that have no active formula (their demand could not be exploded). */
  readonly missingFormula: readonly string[];
}

/** Public API of the product module for other modules (inventory, sales, production, planning). */
@Injectable()
export class ProductCatalog {
  constructor(
    private readonly products: ProductsRepository,
    private readonly formulas: FormulasRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('product')
  async findByIds(ids: readonly string[]): Promise<ProductSummary[]> {
    this.currentActor.requirePermission('products:read');
    return (await this.products.findByIds([...new Set(ids)])).map(toSummary);
  }

  @Transactional('product')
  async findByCodes(codes: readonly string[]): Promise<ProductSummary[]> {
    this.currentActor.requirePermission('products:read');
    return (await this.products.findByCodes(codes)).map(toSummary);
  }

  @Transactional('product')
  async list(filter: { type?: ProductType; active?: boolean } = {}): Promise<ProductSummary[]> {
    this.currentActor.requirePermission('products:read');
    return (await this.products.list(filter)).map(toSummary);
  }

  /**
   * One level of explosion: the components needed to make each demanded quantity with the product's
   * active formula, aggregated by component and rounded up per product.
   */
  @Transactional('product')
  async requirementsFor(
    demands: readonly { productId: string; quantity: bigint }[],
  ): Promise<RequirementsResult> {
    this.currentActor.requirePermission('products:read');
    const positive = demands.filter((demand) => demand.quantity > 0n);
    const productIds = [...new Set(positive.map((demand) => demand.productId))];
    const formulas = new Map(
      (await this.formulas.activeFor(productIds)).map((formula) => [formula.productId, formula]),
    );
    const componentIds = [...formulas.values()].flatMap((f) => f.lines.map((l) => l.componentId));
    const products = new Map(
      (await this.products.findByIds([...new Set([...productIds, ...componentIds])])).map((p) => [
        p.id,
        p,
      ]),
    );

    const totals = new Map<string, bigint>();
    const missing = new Set<string>();
    for (const demand of positive) {
      const formula = formulas.get(demand.productId);
      const product = products.get(demand.productId);
      if (!formula || !product) {
        missing.add(demand.productId);
        continue;
      }
      const definition = toDefinition(formula, product, products);
      const quantity = Quantity.ofBase(demand.quantity, dimensionOf(product.stockUnit));
      for (const need of requirements(definition, quantity)) {
        totals.set(need.componentId, (totals.get(need.componentId) ?? 0n) + need.quantity.base);
      }
    }
    return {
      needs: [...totals].map(([componentId, quantity]) => ({ componentId, quantity })),
      missingFormula: [...missing],
    };
  }
}

export function toDefinition(
  formula: FormulaRecord,
  product: ProductRecord,
  products: ReadonlyMap<string, ProductRecord>,
): FormulaDefinition {
  return {
    batchYield: Quantity.ofBase(formula.batchYield, dimensionOf(product.stockUnit)),
    lines: formula.lines.map((line) => {
      const component = products.get(line.componentId);
      if (!component) throw new Error(`Componente ${line.componentId} no encontrado`);
      return {
        componentId: line.componentId,
        quantity: Quantity.ofBase(line.quantity, dimensionOf(component.stockUnit)),
        wasteBps: line.wasteBps,
      };
    }),
  };
}

function toSummary(product: ProductRecord): ProductSummary {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    type: product.type,
    stockUnit: product.stockUnit,
    active: product.active,
    batchCapacity: product.batchCapacity,
  };
}
