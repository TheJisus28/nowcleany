import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { sql } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { ProductTables } from '../product.tables.js';
import type { UnitCode } from '../../../shared-kernel/index.js';
import type { ProductType } from '../domain/product.js';

export interface ProductRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductType;
  readonly stockUnit: UnitCode;
  readonly batchCapacity: bigint | null;
  readonly price: bigint | null;
  readonly cost: bigint | null;
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
  readonly price?: bigint | null;
  readonly cost?: bigint | null;
}

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<ProductTables>,
  ) {}

  async findById(id: string): Promise<ProductRecord | undefined> {
    const row = await this.select().where('p.id', '=', id).executeTakeFirst();
    return row && toRecord(row);
  }

  async findByIds(ids: readonly string[]): Promise<ProductRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.select().where('p.id', 'in', ids).execute();
    return rows.map(toRecord);
  }

  async findByCodes(codes: readonly string[]): Promise<ProductRecord[]> {
    if (codes.length === 0) return [];
    const rows = await this.select().where('p.code', 'in', codes).execute();
    return rows.map(toRecord);
  }

  async list(filter: ProductFilter): Promise<ProductRecord[]> {
    let query = this.select();
    if (filter.type) query = query.where('p.type', '=', filter.type);
    if (filter.active !== undefined) query = query.where('p.active', '=', filter.active);
    if (filter.search) {
      const pattern = `%${filter.search.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([eb('p.code', 'ilike', pattern), eb('p.name', 'ilike', pattern)]),
      );
    }
    const rows = await query.orderBy('p.type').orderBy('p.code').execute();
    return rows.map(toRecord);
  }

  async insert(product: NewProduct): Promise<string> {
    try {
      const row = await this.host.tx
        .insertInto('products')
        .values({
          code: product.code,
          name: product.name,
          type: product.type,
          stock_unit: product.stockUnit,
          batch_capacity: product.batchCapacity,
          price: product.price ?? null,
          cost: product.cost ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError(
          'product.code_taken',
          `Ya existe un producto con el código ${product.code}.`,
        );
      }
      throw error;
    }
  }

  /** Fails with a conflict when the product has stock movements or is used by a formula or a document. */
  async remove(id: string, code: string): Promise<void> {
    const moved = await sql<{ moved: boolean }>`
      SELECT EXISTS (SELECT 1 FROM stock_movements WHERE product_id = ${id}) AS moved
    `.execute(this.host.tx);
    if (moved.rows[0]?.moved) {
      throw new ConflictError(
        'product.has_movements',
        `${code} ya tiene movimientos de inventario: no se puede eliminar, desactívalo.`,
      );
    }
    try {
      await sql`DELETE FROM stock_balances WHERE product_id = ${id}`.execute(this.host.tx);
      await this.host.tx.deleteFrom('products').where('id', '=', id).execute();
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        throw new ConflictError(
          'product.in_use',
          `${code} ya se usa en una fórmula, un pedido o una orden: no se puede eliminar, desactívalo.`,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    changes: {
      name?: string;
      batchCapacity?: bigint | null;
      price?: bigint | null;
      cost?: bigint | null;
      active?: boolean;
    },
  ): Promise<void> {
    await this.host.tx
      .updateTable('products')
      .set({
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.batchCapacity === undefined ? {} : { batch_capacity: changes.batchCapacity }),
        ...(changes.price === undefined ? {} : { price: changes.price }),
        ...(changes.cost === undefined ? {} : { cost: changes.cost }),
        ...(changes.active === undefined ? {} : { active: changes.active }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  private select() {
    return this.host.tx.selectFrom('products as p').select([
      'p.id',
      'p.code',
      'p.name',
      'p.type',
      'p.stock_unit',
      'p.batch_capacity',
      'p.price',
      'p.cost',
      'p.active',
      sql<number | null>`(SELECT f.version FROM formulas f
          WHERE f.product_id = p.id AND f.status = 'ACTIVE')`.as('active_formula_version'),
      sql<boolean>`EXISTS (SELECT 1 FROM formulas f
          WHERE f.product_id = p.id AND f.status = 'DRAFT')`.as('has_draft_formula'),
    ]);
  }
}

function toRecord(row: {
  id: string;
  code: string;
  name: string;
  type: ProductRecord['type'];
  stock_unit: ProductRecord['stockUnit'];
  batch_capacity: bigint | null;
  price: bigint | null;
  cost: bigint | null;
  active: boolean;
  active_formula_version: number | null;
  has_draft_formula: boolean;
}): ProductRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    stockUnit: row.stock_unit,
    batchCapacity: row.batch_capacity,
    price: row.price,
    cost: row.cost,
    active: row.active,
    activeFormulaVersion: row.active_formula_version,
    hasDraftFormula: row.has_draft_formula,
  };
}
