import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  ConflictError,
  NotFoundError,
  Quantity,
  type QuantityDto,
  toQuantityDto,
} from '../../../shared-kernel/index.js';
import { ProductCatalog } from '../catalog/product-catalog.js';
import { assertCanPublish, type FormulaProduct, validateFormula } from '../domain/formula.js';
import { dimensionOf, PRODUCT_TYPE_LABELS, type ProductType } from '../domain/product.js';
import type { ProductRecord } from '../products/products.repository.js';
import { ProductsRepository } from '../products/products.repository.js';
import { type FormulaView, toFormulaView } from './formula-view.js';
import { type FormulaRecord, FormulasRepository } from './formulas.repository.js';

export interface SaveDraftCommand {
  /** Quantity one batch yields, in `unit` (defaults to the product's stock unit). */
  readonly batchYield: string;
  readonly unit?: string;
  readonly notes?: string;
  readonly lines: readonly {
    readonly componentId: string;
    readonly quantity: string;
    readonly unit?: string;
  }[];
}

export interface RequirementLineView {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly typeLabel: string;
  readonly quantity: QuantityDto;
}

export interface WhereUsedView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly typeLabel: string;
}

export interface RequirementsView {
  readonly product: { id: string; code: string; name: string };
  readonly quantity: QuantityDto;
  readonly formulaVersion: number;
  /** Direct components of the active formula. */
  readonly components: readonly RequirementLineView[];
  /** Only with `expand`: bulk components exploded down to raw materials, aggregated. */
  readonly rawMaterials?: readonly RequirementLineView[];
}

@Injectable()
export class FormulasService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly formulas: FormulasRepository,
    private readonly catalog: ProductCatalog,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async history(productId: string): Promise<FormulaView[]> {
    const product = await this.requireProduct(productId);
    return this.views(await this.formulas.history(productId), product);
  }

  @Transactional()
  async current(productId: string, status: 'DRAFT' | 'ACTIVE'): Promise<FormulaView> {
    const product = await this.requireProduct(productId);
    const formula = await this.formulas.findByStatus(productId, status);
    if (!formula) {
      throw new NotFoundError(
        status === 'ACTIVE' ? 'formula.no_active' : 'formula.no_draft',
        status === 'ACTIVE'
          ? `${product.code} no tiene fórmula vigente.`
          : `${product.code} no tiene un borrador de fórmula.`,
      );
    }
    return this.view(formula, product);
  }

  @Transactional()
  async get(formulaId: string): Promise<FormulaView> {
    const formula = await this.requireFormula(formulaId);
    const product = await this.requireProduct(formula.productId);
    return this.view(formula, product);
  }

  /** Creates the product's draft, or replaces its content if a draft already exists. */
  @Transactional()
  async saveDraft(productId: string, command: SaveDraftCommand): Promise<FormulaView> {
    const product = await this.requireProduct(productId);
    const components = await this.componentsOf(command.lines.map((line) => line.componentId));
    const batchYield = Quantity.parse(command.batchYield, command.unit ?? product.stockUnit);
    const lines = command.lines.map((line) => {
      const component = components.get(line.componentId);
      return {
        componentId: line.componentId,
        quantity: Quantity.parse(line.quantity, line.unit ?? component?.stockUnit ?? 'un'),
      };
    });
    validateFormula(
      toFormulaProduct(product),
      { batchYield, lines },
      toFormulaProducts(components),
    );

    const actor = this.currentActor.require();
    const content = {
      batchYield: batchYield.base,
      notes: command.notes?.trim() ? command.notes.trim() : null,
      author: { id: actor.id, name: actor.displayName },
      lines: lines.map((line) => ({
        componentId: line.componentId,
        quantity: line.quantity.base,
      })),
    };
    const draft = await this.formulas.findByStatus(productId, 'DRAFT');
    if (draft) {
      await this.formulas.replaceDraft(draft.id, content);
    } else {
      await this.formulas.insertDraft(
        productId,
        await this.formulas.nextVersion(productId),
        content,
      );
    }
    return this.current(productId, 'DRAFT');
  }

  @Transactional()
  async discardDraft(productId: string): Promise<void> {
    const draft = await this.formulas.findByStatus(productId, 'DRAFT');
    if (!draft) throw new NotFoundError('formula.no_draft', 'No hay borrador para descartar.');
    await this.formulas.deleteDraft(draft.id);
  }

  /** DRAFT → ACTIVE; the previous active version becomes RETIRED. Four-eyes rule applies. */
  @Transactional()
  async publish(formulaId: string): Promise<FormulaView> {
    const formula = await this.requireFormula(formulaId);
    const product = await this.requireProduct(formula.productId);
    const actor = this.currentActor.require();
    assertCanPublish(formula, {
      id: actor.id,
      canPublishOwn: actor.permissions.has('formulas:publish-own'),
    });
    // Components may have been deactivated since the draft was written.
    const components = await this.componentsOf(formula.lines.map((line) => line.componentId));
    validateFormula(
      toFormulaProduct(product),
      {
        batchYield: Quantity.ofBase(formula.batchYield, dimensionOf(product.stockUnit)),
        lines: formula.lines.map((line) => ({
          componentId: line.componentId,
          quantity: Quantity.ofBase(
            line.quantity,
            dimensionOf(components.get(line.componentId)?.stockUnit ?? 'un'),
          ),
        })),
      },
      toFormulaProducts(components),
    );
    const active = await this.formulas.findByStatus(product.id, 'ACTIVE');
    if (active) await this.formulas.retire(active.id);
    await this.formulas.publish(formula.id, { id: actor.id, name: actor.displayName });
    return this.get(formula.id);
  }

  /** Which products (with an active formula) consume a component, to follow it up the chain. */
  @Transactional()
  async whereUsed(productId: string): Promise<WhereUsedView[]> {
    await this.requireProduct(productId);
    const users = await this.products.findByIds(await this.formulas.productsUsing(productId));
    return users
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        type: product.type,
        typeLabel: PRODUCT_TYPE_LABELS[product.type],
      }));
  }

  @Transactional()
  async requirements(
    productId: string,
    request: { quantity: string; unit?: string; expand?: boolean },
  ): Promise<RequirementsView> {
    const product = await this.requireProduct(productId);
    const formula = await this.formulas.findByStatus(productId, 'ACTIVE');
    if (!formula) {
      throw new ConflictError('formula.no_active', `${product.code} no tiene fórmula vigente.`);
    }
    const quantity = Quantity.parse(request.quantity, request.unit ?? product.stockUnit);
    if (quantity.dimension !== dimensionOf(product.stockUnit) || !quantity.isPositive()) {
      throw new ConflictError(
        'formula.incompatible_quantity',
        `La cantidad debe ser mayor que cero y estar en una unidad compatible con ${product.stockUnit}.`,
      );
    }
    const direct = await this.catalog.requirementsFor([{ productId, quantity: quantity.base }]);
    let rawMaterials: Map<string, bigint> | undefined;
    if (request.expand) {
      const components = await this.componentsOf(direct.needs.map((need) => need.componentId));
      const bulks = direct.needs.filter((n) => components.get(n.componentId)?.type === 'BULK');
      const expanded = await this.catalog.requirementsFor(
        bulks.map((need) => ({ productId: need.componentId, quantity: need.quantity })),
      );
      rawMaterials = new Map();
      for (const need of [...direct.needs.filter((n) => !bulks.includes(n)), ...expanded.needs]) {
        rawMaterials.set(
          need.componentId,
          (rawMaterials.get(need.componentId) ?? 0n) + need.quantity,
        );
      }
    }
    const all = await this.componentsOf([
      ...direct.needs.map((need) => need.componentId),
      ...(rawMaterials ? rawMaterials.keys() : []),
    ]);
    const line = (componentId: string, base: bigint): RequirementLineView => {
      const component = all.get(componentId);
      if (!component) throw new Error(`Componente ${componentId} no encontrado`);
      return {
        productId: component.id,
        code: component.code,
        name: component.name,
        type: component.type,
        typeLabel: PRODUCT_TYPE_LABELS[component.type],
        quantity: toQuantityDto(base, component.stockUnit),
      };
    };
    return {
      product: { id: product.id, code: product.code, name: product.name },
      quantity: toQuantityDto(quantity.base, product.stockUnit),
      formulaVersion: formula.version,
      components: direct.needs.map((need) => line(need.componentId, need.quantity)),
      ...(rawMaterials
        ? { rawMaterials: [...rawMaterials].map(([id, base]) => line(id, base)) }
        : {}),
    };
  }

  private async view(formula: FormulaRecord, product: ProductRecord): Promise<FormulaView> {
    const [view] = await this.views([formula], product);
    if (!view) throw new Error(`Fórmula ${formula.id} sin vista`);
    return view;
  }

  private async views(formulas: FormulaRecord[], product: ProductRecord): Promise<FormulaView[]> {
    const components = await this.componentsOf(
      formulas.flatMap((formula) => formula.lines.map((line) => line.componentId)),
    );
    return formulas.map((formula) => toFormulaView(formula, product, components));
  }

  private async componentsOf(ids: Iterable<string>): Promise<Map<string, ProductRecord>> {
    const unique = [...new Set(ids)];
    return new Map((await this.products.findByIds(unique)).map((p) => [p.id, p]));
  }

  private async requireProduct(id: string): Promise<ProductRecord> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundError('product.not_found', 'El producto no existe.');
    return product;
  }

  private async requireFormula(id: string): Promise<FormulaRecord> {
    const formula = await this.formulas.findById(id);
    if (!formula) throw new NotFoundError('formula.not_found', 'La fórmula no existe.');
    return formula;
  }
}

function toFormulaProduct(product: ProductRecord): FormulaProduct {
  return {
    id: product.id,
    code: product.code,
    type: product.type,
    dimension: dimensionOf(product.stockUnit),
    active: product.active,
  };
}

function toFormulaProducts(
  products: ReadonlyMap<string, ProductRecord>,
): Map<string, FormulaProduct> {
  return new Map([...products].map(([id, product]) => [id, toFormulaProduct(product)]));
}
