import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { CustomerData } from '../domain/customer.js';
import type { SalesTables } from '../sales.tables.js';

export interface CustomerRecord extends CustomerData {
  readonly id: string;
  readonly active: boolean;
}

@Injectable()
export class CustomersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<SalesTables>,
  ) {}

  async list(search?: string): Promise<CustomerRecord[]> {
    let query = this.select();
    if (search) {
      const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([eb('name', 'ilike', pattern), eb('tax_id', 'ilike', pattern)]),
      );
    }
    return (await query.orderBy('name').limit(200).execute()).map(toRecord);
  }

  async findById(id: string): Promise<CustomerRecord | undefined> {
    const row = await this.select().where('id', '=', id).executeTakeFirst();
    return row && toRecord(row);
  }

  async findByIds(ids: readonly string[]): Promise<CustomerRecord[]> {
    if (ids.length === 0) return [];
    return (await this.select().where('id', 'in', ids).execute()).map(toRecord);
  }

  async insert(customer: CustomerData): Promise<string> {
    try {
      const row = await this.host.tx
        .insertInto('customers')
        .values({
          name: customer.name,
          tax_id: customer.taxId,
          phone: customer.phone,
          city: customer.city,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    } catch (error) {
      throw taxIdConflict(error, customer.taxId);
    }
  }

  async update(id: string, customer: CustomerData & { active?: boolean }): Promise<void> {
    try {
      await this.host.tx
        .updateTable('customers')
        .set({
          name: customer.name,
          tax_id: customer.taxId,
          phone: customer.phone,
          city: customer.city,
          ...(customer.active === undefined ? {} : { active: customer.active }),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();
    } catch (error) {
      throw taxIdConflict(error, customer.taxId);
    }
  }

  private select() {
    return this.host.tx
      .selectFrom('customers')
      .select(['id', 'name', 'tax_id', 'phone', 'city', 'active']);
  }
}

function taxIdConflict(error: unknown, taxId: string | null): unknown {
  if ((error as { code?: string }).code === '23505') {
    return new ConflictError(
      'sales.tax_id_taken',
      `Ya existe un cliente con el NIT ${taxId ?? ''}.`,
    );
  }
  return error;
}

function toRecord(row: {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  city: string | null;
  active: boolean;
}): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    phone: row.phone,
    city: row.city,
    active: row.active,
  };
}
