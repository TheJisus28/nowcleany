import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import { ConflictError } from '../../../shared-kernel/index.js';
import type { BranchData, CustomerData, DocumentType } from '../domain/customer.js';
import type { SalesTables } from '../sales.tables.js';

export interface BranchRecord extends BranchData {
  readonly id: string;
  readonly customerId: string;
  readonly isMain: boolean;
  readonly active: boolean;
}

export interface CustomerRecord extends CustomerData {
  readonly id: string;
  readonly active: boolean;
  readonly seller: { id: string; name: string } | null;
  readonly branches: readonly BranchRecord[];
}

export interface CustomerFilter {
  readonly search?: string;
  /** Only this seller's portfolio. */
  readonly sellerId?: string;
}

@Injectable()
export class CustomersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<SalesTables>,
  ) {}

  async list(filter: CustomerFilter): Promise<CustomerRecord[]> {
    let query = this.select();
    if (filter.sellerId) query = query.where('c.seller_id', '=', filter.sellerId);
    if (filter.search) {
      const pattern = `%${filter.search.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([eb('c.name', 'ilike', pattern), eb('c.document_number', 'ilike', pattern)]),
      );
    }
    return this.withBranches(await query.orderBy('c.name').limit(300).execute());
  }

  async findByDocument(documentNumber: string): Promise<CustomerRecord | undefined> {
    const rows = await this.select().where('c.document_number', '=', documentNumber).execute();
    return (await this.withBranches(rows))[0];
  }

  async findById(id: string): Promise<CustomerRecord | undefined> {
    return (await this.withBranches(await this.select().where('c.id', '=', id).execute()))[0];
  }

  async insert(customer: CustomerData, sellerId: string | null): Promise<string> {
    try {
      const row = await this.host.tx
        .insertInto('customers')
        .values({
          document_type: customer.documentType,
          document_number: customer.documentNumber,
          name: customer.name,
          address: customer.address,
          phone: customer.phone,
          city: customer.city,
          seller_id: sellerId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    } catch (error) {
      throw documentConflict(error, customer.documentNumber);
    }
  }

  async update(
    id: string,
    changes: Partial<CustomerData> & { sellerId?: string | null; active?: boolean },
  ): Promise<void> {
    try {
      await this.host.tx
        .updateTable('customers')
        .set({
          ...(changes.documentType === undefined ? {} : { document_type: changes.documentType }),
          ...(changes.documentNumber === undefined
            ? {}
            : { document_number: changes.documentNumber }),
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.address === undefined ? {} : { address: changes.address }),
          ...(changes.phone === undefined ? {} : { phone: changes.phone }),
          ...(changes.city === undefined ? {} : { city: changes.city }),
          ...(changes.sellerId === undefined ? {} : { seller_id: changes.sellerId }),
          ...(changes.active === undefined ? {} : { active: changes.active }),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();
    } catch (error) {
      throw documentConflict(error, changes.documentNumber ?? '');
    }
  }

  async insertBranch(customerId: string, branch: BranchData, isMain: boolean): Promise<string> {
    const row = await this.host.tx
      .insertInto('customer_branches')
      .values({ customer_id: customerId, ...toBranchRow(branch), is_main: isMain })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async updateBranch(id: string, branch: BranchData & { active?: boolean }): Promise<void> {
    await this.host.tx
      .updateTable('customer_branches')
      .set({
        ...toBranchRow(branch),
        ...(branch.active === undefined ? {} : { active: branch.active }),
      })
      .where('id', '=', id)
      .execute();
  }

  async findBranch(id: string): Promise<BranchRecord | undefined> {
    const row = await this.host.tx
      .selectFrom('customer_branches')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row && toBranch(row);
  }

  private select() {
    return this.host.tx
      .selectFrom('customers as c')
      .leftJoin('users as u', 'u.id', 'c.seller_id')
      .select([
        'c.id',
        'c.document_type',
        'c.document_number',
        'c.name',
        'c.address',
        'c.phone',
        'c.city',
        'c.seller_id',
        'u.full_name as seller_name',
        'c.active',
      ]);
  }

  private async withBranches(
    rows: readonly {
      id: string;
      document_type: DocumentType;
      document_number: string;
      name: string;
      address: string | null;
      phone: string | null;
      city: string | null;
      seller_id: string | null;
      seller_name: string | null;
      active: boolean;
    }[],
  ): Promise<CustomerRecord[]> {
    if (rows.length === 0) return [];
    const branches = await this.host.tx
      .selectFrom('customer_branches')
      .selectAll()
      .where(
        'customer_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('is_main', 'desc')
      .orderBy('name')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      documentType: row.document_type,
      documentNumber: row.document_number,
      name: row.name,
      address: row.address,
      phone: row.phone,
      city: row.city,
      active: row.active,
      seller: row.seller_id ? { id: row.seller_id, name: row.seller_name ?? '' } : null,
      branches: branches.filter((branch) => branch.customer_id === row.id).map(toBranch),
    }));
  }
}

function toBranchRow(branch: BranchData) {
  return {
    name: branch.name,
    address: branch.address,
    city: branch.city,
    phone: branch.phone,
    latitude: branch.latitude,
    longitude: branch.longitude,
  };
}

function toBranch(row: {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  is_main: boolean;
  active: boolean;
}): BranchRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    isMain: row.is_main,
    active: row.active,
  };
}

function documentConflict(error: unknown, documentNumber: string): unknown {
  if (error instanceof Error && 'code' in error && error.code === '23505') {
    return new ConflictError(
      'sales.document_taken',
      `Ya existe un cliente con el documento ${documentNumber}.`,
    );
  }
  return error;
}
