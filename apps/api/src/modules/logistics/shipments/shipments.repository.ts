import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { ShipmentStatus } from '../domain/shipment.js';
import type { LogisticsTables } from '../logistics.tables.js';

export interface ShipmentOrderRecord {
  readonly orderId: string;
  readonly position: number;
  readonly deliveredAt: Date | null;
  readonly receivedBy: string | null;
  readonly lines: readonly {
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    quantity: bigint;
  }[];
}

export interface ShipmentRecord {
  readonly id: string;
  readonly number: bigint;
  readonly carrier: string;
  readonly vehiclePlate: string;
  readonly driverName: string;
  readonly route: string | null;
  readonly scheduledDate: string;
  readonly status: ShipmentStatus;
  readonly notes: string | null;
  readonly createdByName: string;
  readonly createdAt: Date;
  readonly dispatchedAt: Date | null;
  readonly dispatchedByName: string | null;
  readonly deliveredAt: Date | null;
  readonly orders: readonly ShipmentOrderRecord[];
}

export type NewShipment = Pick<
  ShipmentRecord,
  'carrier' | 'vehiclePlate' | 'driverName' | 'route' | 'scheduledDate' | 'notes' | 'createdByName'
> & {
  readonly createdAt?: Date | undefined;
  readonly orders: readonly Pick<ShipmentOrderRecord, 'orderId' | 'lines'>[];
};

@Injectable()
export class ShipmentsRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<LogisticsTables>,
  ) {}

  async insert(shipment: NewShipment): Promise<{ id: string; number: bigint }> {
    const row = await this.host.tx
      .insertInto('shipments')
      .values({
        carrier: shipment.carrier,
        vehicle_plate: shipment.vehiclePlate,
        driver_name: shipment.driverName,
        route: shipment.route,
        scheduled_date: shipment.scheduledDate,
        status: 'PLANNED',
        notes: shipment.notes,
        created_by_name: shipment.createdByName,
        dispatched_at: null,
        dispatched_by_name: null,
        delivered_at: null,
        ...(shipment.createdAt ? { created_at: shipment.createdAt } : {}),
      })
      .returning(['id', 'number'])
      .executeTakeFirstOrThrow();
    await this.host.tx
      .insertInto('shipment_orders')
      .values(
        shipment.orders.map((order, index) => ({
          shipment_id: row.id,
          order_id: order.orderId,
          position: index + 1,
          delivered_at: null,
          received_by: null,
        })),
      )
      .execute();
    const lines = shipment.orders.flatMap((order) =>
      order.lines.map((line) => ({
        shipment_id: row.id,
        order_id: order.orderId,
        product_id: line.productId,
        product_code: line.productCode,
        product_name: line.productName,
        unit: line.unit,
        quantity: line.quantity,
      })),
    );
    if (lines.length > 0) await this.host.tx.insertInto('shipment_lines').values(lines).execute();
    return row;
  }

  async list(filter: {
    statuses?: readonly ShipmentStatus[] | undefined;
    orderId?: string | undefined;
    ids?: readonly string[] | undefined;
    limit: number;
  }): Promise<ShipmentRecord[]> {
    let query = this.host.tx.selectFrom('shipments').selectAll();
    if (filter.ids) query = query.where('id', 'in', filter.ids);
    if (filter.statuses && filter.statuses.length > 0)
      query = query.where('status', 'in', filter.statuses);
    const { orderId } = filter;
    if (orderId)
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('shipment_orders as so')
            .select('so.order_id')
            .whereRef('so.shipment_id', '=', 'shipments.id')
            .where('so.order_id', '=', orderId),
        ),
      );
    const rows = await query.orderBy('number', 'desc').limit(filter.limit).execute();
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const orders = await this.host.tx
      .selectFrom('shipment_orders')
      .selectAll()
      .where('shipment_id', 'in', ids)
      .orderBy('position')
      .execute();
    const lines = await this.host.tx
      .selectFrom('shipment_lines')
      .selectAll()
      .where('shipment_id', 'in', ids)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      carrier: row.carrier,
      vehiclePlate: row.vehicle_plate,
      driverName: row.driver_name,
      route: row.route,
      scheduledDate: row.scheduled_date,
      status: row.status,
      notes: row.notes,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      dispatchedAt: row.dispatched_at,
      dispatchedByName: row.dispatched_by_name,
      deliveredAt: row.delivered_at,
      orders: orders
        .filter((order) => order.shipment_id === row.id)
        .map((order) => ({
          orderId: order.order_id,
          position: order.position,
          deliveredAt: order.delivered_at,
          receivedBy: order.received_by,
          lines: lines
            .filter((line) => line.shipment_id === row.id && line.order_id === order.order_id)
            .map((line) => ({
              productId: line.product_id,
              productCode: line.product_code,
              productName: line.product_name,
              unit: line.unit,
              quantity: line.quantity,
            })),
        })),
    }));
  }

  async findById(id: string): Promise<ShipmentRecord | undefined> {
    return (await this.list({ ids: [id], limit: 1 }))[0];
  }

  async markDispatched(id: string, byName: string, at = new Date()): Promise<void> {
    await this.host.tx
      .updateTable('shipments')
      .set({ status: 'IN_TRANSIT', dispatched_at: at, dispatched_by_name: byName })
      .where('id', '=', id)
      .where('status', '=', 'PLANNED')
      .execute();
  }

  async markOrderDelivered(
    shipmentId: string,
    orderId: string,
    receivedBy: string,
    at = new Date(),
  ): Promise<void> {
    await this.host.tx
      .updateTable('shipment_orders')
      .set({ delivered_at: at, received_by: receivedBy })
      .where('shipment_id', '=', shipmentId)
      .where('order_id', '=', orderId)
      .execute();
  }

  async markDelivered(id: string, at = new Date()): Promise<void> {
    await this.host.tx
      .updateTable('shipments')
      .set({ status: 'DELIVERED', delivered_at: at })
      .where('id', '=', id)
      .execute();
  }

  /** Every guide that carried part of an order, with its delivery state. */
  async ofOrder(orderId: string): Promise<{ shipmentId: string; deliveredAt: Date | null }[]> {
    const rows = await this.host.tx
      .selectFrom('shipment_orders')
      .select(['shipment_id', 'delivered_at'])
      .where('order_id', '=', orderId)
      .execute();
    return rows.map((row) => ({ shipmentId: row.shipment_id, deliveredAt: row.delivered_at }));
  }
}
