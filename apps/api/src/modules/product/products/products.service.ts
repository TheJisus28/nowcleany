import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  isUnitCode,
  NotFoundError,
  parseCsv,
  parseMoney,
  normaliseDecimal,
  ValidationError,
  type UnitCode,
} from '../../../shared-kernel/index.js';
import {
  normalizeCode,
  normalizeName,
  parseBatchCapacity,
  parseProductType,
  parseUnitCode,
  type ProductType,
} from '../domain/product.js';
import { type ProductView, toProductView } from './product-view.js';
import { type NewProduct, type ProductFilter, ProductsRepository } from './products.repository.js';

export interface CreateProductCommand {
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly stockUnit: string;
  readonly batchCapacity?: string;
  readonly price?: string;
  readonly cost?: string;
}

export interface UpdateProductCommand {
  readonly name?: string;
  /** In the product's stock unit; an empty string clears it. */
  readonly batchCapacity?: string;
  /** Pesos per stock unit; an empty string clears it. */
  readonly price?: string;
  readonly cost?: string;
  readonly active?: boolean;
}

export interface ImportResult {
  readonly created: number;
  readonly skipped: readonly string[];
}

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductsRepository) {}

  @Transactional()
  async list(filter: ProductFilter): Promise<ProductView[]> {
    return (await this.products.list(filter)).map(toProductView);
  }

  @Transactional()
  async get(id: string): Promise<ProductView> {
    return toProductView(await this.require(id));
  }

  @Transactional()
  async create(command: CreateProductCommand): Promise<ProductView> {
    const product = this.build(command);
    const id = await this.products.insert(product);
    return toProductView(await this.require(id));
  }

  @Transactional()
  async remove(id: string): Promise<void> {
    const product = await this.require(id);
    await this.products.remove(id, product.code);
  }

  @Transactional()
  async update(id: string, command: UpdateProductCommand): Promise<ProductView> {
    const product = await this.require(id);
    await this.products.update(id, {
      ...(command.name === undefined ? {} : { name: normalizeName(command.name) }),
      ...(command.batchCapacity === undefined
        ? {}
        : {
            batchCapacity:
              parseBatchCapacity(product.type, product.stockUnit, command.batchCapacity)?.base ??
              null,
          }),
      ...(command.price === undefined ? {} : { price: parseMoney(command.price) }),
      ...(command.cost === undefined ? {} : { cost: parseMoney(command.cost) }),
      ...(command.active === undefined ? {} : { active: command.active }),
    });
    return toProductView(await this.require(id));
  }

  /** Products are never deleted: they are deactivated, so history keeps its references. */
  @Transactional()
  async deactivate(id: string): Promise<void> {
    await this.require(id);
    await this.products.update(id, { active: false });
  }

  /**
   * CSV with columns codigo; nombre; tipo; unidad; [capacidad_bache]. All rows are validated first:
   * if any row is wrong nothing is imported. Existing codes are skipped.
   */
  @Transactional()
  async import(csv: string): Promise<ImportResult> {
    const rows = parseCsv(csv, ['codigo', 'nombre', 'tipo', 'unidad']);
    if (rows.length === 0) {
      throw new ValidationError('product.import_empty', 'El archivo no tiene filas de productos.');
    }
    const errors: { line: number; message: string }[] = [];
    const parsed: NewProduct[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      try {
        const type = parseProductType(row.values['tipo'] ?? '');
        const product = this.build({
          code: row.values['codigo'] ?? '',
          name: row.values['nombre'] ?? '',
          type,
          stockUnit: parseUnitCode(row.values['unidad'] ?? ''),
          batchCapacity: normaliseDecimal(row.values['capacidad_bache'] ?? ''),
        });
        if (seen.has(product.code)) {
          throw new ValidationError(
            'product.import_duplicate',
            `El código ${product.code} está repetido en el archivo.`,
          );
        }
        seen.add(product.code);
        parsed.push(product);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        errors.push({ line: row.line, message: error.message });
      }
    }
    if (errors.length > 0) {
      throw new ValidationError(
        'product.import_invalid',
        `El archivo tiene ${String(errors.length)} fila(s) con errores; no se importó nada.`,
        { errors },
      );
    }
    const existing = new Set(
      (await this.products.findByCodes(parsed.map((product) => product.code))).map((p) => p.code),
    );
    for (const product of parsed) {
      if (!existing.has(product.code)) await this.products.insert(product);
    }
    return { created: parsed.length - existing.size, skipped: [...existing] };
  }

  private build(command: CreateProductCommand): NewProduct {
    if (!isUnitCode(command.stockUnit)) {
      throw new ValidationError(
        'product.invalid_unit',
        `Unidad desconocida: "${command.stockUnit}".`,
      );
    }
    const stockUnit: UnitCode = command.stockUnit;
    return {
      code: normalizeCode(command.code),
      name: normalizeName(command.name),
      type: command.type,
      stockUnit,
      batchCapacity:
        parseBatchCapacity(command.type, stockUnit, command.batchCapacity)?.base ?? null,
      price: parseMoney(command.price),
      cost: parseMoney(command.cost),
    };
  }

  private async require(id: string) {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundError('product.not_found', 'El producto no existe.');
    return product;
  }
}
