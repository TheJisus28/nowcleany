import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { SalesTables } from '../sales.tables.js';

export interface NewVisit {
  readonly sellerId: string;
  readonly customerId: string;
  readonly branchId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  readonly distanceM: number | null;
  readonly notes: string | null;
  /** Only for loading history (seeds); a real check-in takes the server's clock. */
  readonly visitedAt?: Date;
}

export interface VisitRecord {
  readonly id: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly branch: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  readonly visitedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  readonly distanceM: number | null;
  readonly notes: string | null;
  readonly order: { id: string; number: bigint } | null;
}

export interface VisitFilter {
  readonly sellerId?: string;
  readonly customerId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit: number;
}

@Injectable()
export class VisitsRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<SalesTables>,
  ) {}

  async insert(visit: NewVisit): Promise<string> {
    const row = await this.host.tx
      .insertInto('visits')
      .values({
        seller_id: visit.sellerId,
        customer_id: visit.customerId,
        branch_id: visit.branchId,
        latitude: visit.latitude,
        longitude: visit.longitude,
        accuracy_m: visit.accuracyM,
        distance_m: visit.distanceM,
        notes: visit.notes,
        ...(visit.visitedAt ? { visited_at: visit.visitedAt } : {}),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async findById(id: string): Promise<VisitRecord | undefined> {
    return (await this.select().where('v.id', '=', id).execute()).map(toRecord)[0];
  }

  async list(filter: VisitFilter): Promise<VisitRecord[]> {
    let query = this.select();
    if (filter.sellerId) query = query.where('v.seller_id', '=', filter.sellerId);
    if (filter.customerId) query = query.where('v.customer_id', '=', filter.customerId);
    if (filter.from) query = query.where('v.visited_at', '>=', filter.from);
    if (filter.to) query = query.where('v.visited_at', '<', filter.to);
    const rows = await query.orderBy('v.visited_at', 'desc').limit(filter.limit).execute();
    return rows.map(toRecord);
  }

  async setOrder(visitId: string, orderId: string): Promise<void> {
    await this.host.tx
      .updateTable('visits')
      .set({ order_id: orderId })
      .where('id', '=', visitId)
      .execute();
  }

  private select() {
    return this.host.tx
      .selectFrom('visits as v')
      .innerJoin('users as u', 'u.id', 'v.seller_id')
      .innerJoin('customers as c', 'c.id', 'v.customer_id')
      .innerJoin('customer_branches as b', 'b.id', 'v.branch_id')
      .leftJoin('sales_orders as o', 'o.id', 'v.order_id')
      .select([
        'v.id',
        'v.seller_id',
        'u.full_name as seller_name',
        'v.customer_id',
        'c.name as customer_name',
        'v.branch_id',
        'b.name as branch_name',
        'b.address as branch_address',
        'b.city as branch_city',
        'b.latitude as branch_latitude',
        'b.longitude as branch_longitude',
        'v.visited_at',
        'v.latitude',
        'v.longitude',
        'v.accuracy_m',
        'v.distance_m',
        'v.notes',
        'v.order_id',
        'o.number as order_number',
      ]);
  }
}

function toRecord(row: {
  id: string;
  seller_id: string;
  seller_name: string;
  customer_id: string;
  customer_name: string;
  branch_id: string;
  branch_name: string;
  branch_address: string | null;
  branch_city: string | null;
  branch_latitude: number | null;
  branch_longitude: number | null;
  visited_at: Date;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  distance_m: number | null;
  notes: string | null;
  order_id: string | null;
  order_number: bigint | null;
}): VisitRecord {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    branch: {
      id: row.branch_id,
      name: row.branch_name,
      address: row.branch_address,
      city: row.branch_city,
      latitude: row.branch_latitude,
      longitude: row.branch_longitude,
    },
    visitedAt: row.visited_at,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    distanceM: row.distance_m,
    notes: row.notes,
    order:
      row.order_id && row.order_number !== null
        ? { id: row.order_id, number: row.order_number }
        : null,
  };
}
