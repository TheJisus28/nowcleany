import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { SupplierData } from '../domain/purchase-order.js';
import type { PurchasingTables } from '../purchasing.tables.js';

export interface SupplierRecord extends SupplierData {
  readonly id: string;
  readonly active: boolean;
}

@Injectable()
export class SuppliersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<PurchasingTables>,
  ) {}

  async list(search?: string): Promise<SupplierRecord[]> {
    let query = this.host.tx.selectFrom('suppliers').selectAll();
    if (search) {
      const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([eb('name', 'ilike', pattern), eb('document_number', 'ilike', pattern)]),
      );
    }
    return (await query.orderBy('name').execute()).map(toRecord);
  }

  async findById(id: string): Promise<SupplierRecord | undefined> {
    const row = await this.host.tx
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && toRecord(row);
  }

  async findByName(name: string): Promise<SupplierRecord | undefined> {
    const row = await this.host.tx
      .selectFrom('suppliers')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();
    return row && toRecord(row);
  }

  async insert(supplier: SupplierData): Promise<string> {
    try {
      const row = await this.host.tx
        .insertInto('suppliers')
        .values({
          document_number: supplier.documentNumber,
          name: supplier.name,
          contact: supplier.contact,
          phone: supplier.phone,
          email: supplier.email,
          city: supplier.city,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    } catch (error) {
      throw documentConflict(error);
    }
  }

  async update(id: string, supplier: SupplierData & { active?: boolean }): Promise<void> {
    try {
      await this.host.tx
        .updateTable('suppliers')
        .set({
          document_number: supplier.documentNumber,
          name: supplier.name,
          contact: supplier.contact,
          phone: supplier.phone,
          email: supplier.email,
          city: supplier.city,
          ...(supplier.active === undefined ? {} : { active: supplier.active }),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();
    } catch (error) {
      throw documentConflict(error);
    }
  }
}

function toRecord(row: {
  id: string;
  document_number: string | null;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  active: boolean;
}): SupplierRecord {
  return {
    id: row.id,
    documentNumber: row.document_number,
    name: row.name,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    city: row.city,
    active: row.active,
  };
}

function documentConflict(error: unknown): unknown {
  if (error instanceof Error && 'code' in error && error.code === '23505') {
    return new ConflictError('purchasing.supplier_taken', 'Ya existe un proveedor con ese NIT.');
  }
  return error;
}
