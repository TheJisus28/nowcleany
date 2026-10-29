import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { Selectable } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { ProductTables } from '../product.tables.js';
import type { FormulaStatus } from '../domain/formula.js';

export interface FormulaLineRecord {
  readonly lineNo: number;
  readonly componentId: string;
  /** Per batch, base units of the component. */
  readonly quantity: bigint;
}

export interface FormulaRecord {
  readonly id: string;
  readonly productId: string;
  readonly version: number;
  readonly status: FormulaStatus;
  /** Base units of the product. */
  readonly batchYield: bigint;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdByName: string;
  readonly createdAt: Date;
  readonly publishedBy: string | null;
  readonly publishedByName: string | null;
  readonly publishedAt: Date | null;
  readonly retiredAt: Date | null;
  readonly lines: readonly FormulaLineRecord[];
}

export interface DraftContent {
  readonly batchYield: bigint;
  readonly notes: string | null;
  readonly author: { id: string; name: string };
  readonly lines: readonly { componentId: string; quantity: bigint }[];
}

type FormulaRow = Selectable<ProductTables['formulas']>;

@Injectable()
export class FormulasRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<ProductTables>,
  ) {}

  async findById(id: string): Promise<FormulaRecord | undefined> {
    const rows = await this.host.tx
      .selectFrom('formulas')
      .selectAll()
      .where('id', '=', id)
      .execute();
    return (await this.withLines(rows))[0];
  }

  async findByStatus(
    productId: string,
    status: 'DRAFT' | 'ACTIVE',
  ): Promise<FormulaRecord | undefined> {
    const rows = await this.host.tx
      .selectFrom('formulas')
      .selectAll()
      .where('product_id', '=', productId)
      .where('status', '=', status)
      .execute();
    return (await this.withLines(rows))[0];
  }

  async history(productId: string): Promise<FormulaRecord[]> {
    const rows = await this.host.tx
      .selectFrom('formulas')
      .selectAll()
      .where('product_id', '=', productId)
      .orderBy('version', 'desc')
      .execute();
    return this.withLines(rows);
  }

  async activeFor(productIds: readonly string[]): Promise<FormulaRecord[]> {
    if (productIds.length === 0) return [];
    const rows = await this.host.tx
      .selectFrom('formulas')
      .selectAll()
      .where('product_id', 'in', productIds)
      .where('status', '=', 'ACTIVE')
      .execute();
    return this.withLines(rows);
  }

  async productsUsing(componentId: string): Promise<string[]> {
    const rows = await this.host.tx
      .selectFrom('formulas as f')
      .innerJoin('formula_lines as l', 'l.formula_id', 'f.id')
      .select('f.product_id')
      .distinct()
      .where('f.status', '=', 'ACTIVE')
      .where('l.component_id', '=', componentId)
      .execute();
    return rows.map((row) => row.product_id);
  }

  async nextVersion(productId: string): Promise<number> {
    const row = await this.host.tx
      .selectFrom('formulas')
      .select((eb) => eb.fn.max('version').as('version'))
      .where('product_id', '=', productId)
      .executeTakeFirst();
    return (row?.version ?? 0) + 1;
  }

  async insertDraft(productId: string, version: number, content: DraftContent): Promise<string> {
    const row = await this.host.tx
      .insertInto('formulas')
      .values({
        product_id: productId,
        version,
        status: 'DRAFT',
        batch_yield: content.batchYield,
        notes: content.notes,
        created_by: content.author.id,
        created_by_name: content.author.name,
        published_by: null,
        published_by_name: null,
        published_at: null,
        retired_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.insertLines(row.id, content.lines);
    return row.id;
  }

  async replaceDraft(formulaId: string, content: DraftContent): Promise<void> {
    await this.host.tx
      .updateTable('formulas')
      .set({
        batch_yield: content.batchYield,
        notes: content.notes,
        created_by: content.author.id,
        created_by_name: content.author.name,
        updated_at: new Date(),
      })
      .where('id', '=', formulaId)
      .where('status', '=', 'DRAFT')
      .execute();
    await this.host.tx.deleteFrom('formula_lines').where('formula_id', '=', formulaId).execute();
    await this.insertLines(formulaId, content.lines);
  }

  async deleteDraft(formulaId: string): Promise<void> {
    await this.host.tx
      .deleteFrom('formulas')
      .where('id', '=', formulaId)
      .where('status', '=', 'DRAFT')
      .execute();
  }

  async retire(formulaId: string): Promise<void> {
    await this.host.tx
      .updateTable('formulas')
      .set({ status: 'RETIRED', retired_at: new Date() })
      .where('id', '=', formulaId)
      .where('status', '=', 'ACTIVE')
      .execute();
  }

  async publish(formulaId: string, publisher: { id: string; name: string }): Promise<void> {
    await this.host.tx
      .updateTable('formulas')
      .set({
        status: 'ACTIVE',
        published_by: publisher.id,
        published_by_name: publisher.name,
        published_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', formulaId)
      .where('status', '=', 'DRAFT')
      .execute();
  }

  private async insertLines(formulaId: string, lines: DraftContent['lines']): Promise<void> {
    await this.host.tx
      .insertInto('formula_lines')
      .values(
        lines.map((line, index) => ({
          formula_id: formulaId,
          line_no: index + 1,
          component_id: line.componentId,
          quantity: line.quantity,
        })),
      )
      .execute();
  }

  private async withLines(rows: FormulaRow[]): Promise<FormulaRecord[]> {
    if (rows.length === 0) return [];
    const lines = await this.host.tx
      .selectFrom('formula_lines')
      .selectAll()
      .where(
        'formula_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('line_no')
      .execute();
    const byFormula = new Map<string, FormulaLineRecord[]>();
    for (const line of lines) {
      const list = byFormula.get(line.formula_id) ?? [];
      list.push({
        lineNo: line.line_no,
        componentId: line.component_id,
        quantity: line.quantity,
      });
      byFormula.set(line.formula_id, list);
    }
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      version: row.version,
      status: row.status,
      batchYield: row.batch_yield,
      notes: row.notes,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      publishedBy: row.published_by,
      publishedByName: row.published_by_name,
      publishedAt: row.published_at,
      retiredAt: row.retired_at,
      lines: byFormula.get(row.id) ?? [],
    }));
  }
}
