import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  ConflictError,
  NotFoundError,
  type QuantityDto,
  toQuantityDto,
  type UnitCode,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { Trail } from '../../audit/index.js';
import { SalesDirectory } from '../../sales/index.js';
import {
  normalizePlate,
  requireText,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
  shipmentLabel,
} from '../domain/shipment.js';
import { type ShipmentRecord, ShipmentsRepository } from './shipments.repository.js';

export interface ShipmentView {
  readonly id: string;
  readonly label: string;
  readonly carrier: string;
  readonly vehiclePlate: string;
  readonly driverName: string;
  readonly route: string | null;
  readonly scheduledDate: string;
  readonly status: ShipmentStatus;
  readonly statusLabel: string;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly dispatchedAt: string | null;
  readonly dispatchedBy: string | null;
  readonly deliveredAt: string | null;
  readonly orders: readonly {
    orderId: string;
    orderLabel: string;
    customer: { id: string; name: string };
    branch: { name: string; address: string | null; city: string | null };
    partial: boolean;
    deliveredAt: string | null;
    receivedBy: string | null;
    lines: readonly {
      productId: string;
      productCode: string;
      productName: string;
      quantity: QuantityDto;
    }[];
  }[];
}

/** Logistics: guides that carry invoiced orders plant handed over, their dispatch and delivery. */
@Injectable()
export class ShipmentsService {
  constructor(
    private readonly shipments: ShipmentsRepository,
    private readonly sales: SalesDirectory,
    private readonly trail: Trail,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async list(filter: { statuses?: ShipmentStatus[]; orderId?: string; limit?: number }) {
    const rows = await this.shipments.list({
      statuses: filter.statuses,
      orderId: filter.orderId,
      limit: Math.min(filter.limit ?? 100, 1000),
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  @Transactional()
  async get(id: string): Promise<ShipmentView> {
    return this.toView(await this.require(id));
  }

  /** A guide with orders ready for dispatch: it carries what plant handed over of each. */
  @Transactional()
  async create(
    command: {
      orderIds: readonly string[];
      carrier: string;
      vehiclePlate: string;
      driverName: string;
      route?: string;
      scheduledDate: string;
      notes?: string;
    },
    at?: Date,
  ): Promise<ShipmentView> {
    this.currentActor.requirePermission('shipments:write');
    const ready = await this.sales.inStatus('READY', command.orderIds);
    const missing = command.orderIds.filter((id) => !ready.some((order) => order.id === id));
    if (command.orderIds.length === 0 || missing.length > 0) {
      throw new ConflictError(
        'logistics.not_ready',
        'Solo se incluyen en una guía pedidos que planta ya entregó a despacho.',
      );
    }
    const { id, number } = await this.shipments.insert({
      carrier: requireText(command.carrier, 'El transportador', 120),
      vehiclePlate: normalizePlate(command.vehiclePlate),
      driverName: requireText(command.driverName, 'El conductor', 120),
      route: command.route?.trim() ? command.route.trim() : null,
      scheduledDate: command.scheduledDate,
      notes: command.notes?.trim() ? command.notes.trim() : null,
      createdByName: this.currentActor.require().displayName,
      createdAt: at,
      orders: ready.map((order) => ({
        orderId: order.id,
        lines: order.lines
          .filter((line) => line.readyQuantity > 0n)
          .map((line) => ({
            productId: line.productId,
            productCode: line.productCode,
            productName: line.productName,
            unit: line.unit,
            quantity: line.readyQuantity,
          })),
      })),
    });
    await this.trail.record({
      entity: 'shipment',
      id,
      label: shipmentLabel(number),
      action: 'created',
      summary: `Armó la guía ${shipmentLabel(number)} con ${ready.map((order) => order.label).join(', ')}.`,
      at,
    });
    return this.get(id);
  }

  /** The vehicle leaves: each order's goods leave the dispatch warehouse. */
  @Transactional()
  async dispatch(id: string, at?: Date): Promise<ShipmentView> {
    this.currentActor.requirePermission('shipments:write');
    const shipment = await this.require(id);
    if (shipment.status !== 'PLANNED') {
      throw new ConflictError('logistics.already_dispatched', 'Esta guía ya salió.');
    }
    const label = shipmentLabel(shipment.number);
    const detail = `placa ${shipment.vehiclePlate}, conductor ${shipment.driverName}`;
    for (const order of shipment.orders) {
      await this.sales.markDispatched(order.orderId, { id: shipment.id, label, detail }, at);
    }
    await this.shipments.markDispatched(id, this.currentActor.require().displayName, at);
    await this.trail.record({
      entity: 'shipment',
      id,
      label,
      action: 'dispatched',
      summary: `Despachó la guía ${label} (${detail}).`,
      at,
    });
    return this.get(id);
  }

  /** The customer received an order of the guide; the guide ends when every order is delivered. */
  @Transactional()
  async deliver(id: string, orderId: string, receivedBy: string, at?: Date): Promise<ShipmentView> {
    this.currentActor.requirePermission('shipments:write');
    const shipment = await this.require(id);
    if (shipment.status !== 'IN_TRANSIT') {
      throw new ConflictError(
        'logistics.not_in_transit',
        'Solo se confirma la entrega de una guía en ruta.',
      );
    }
    const entry = shipment.orders.find((order) => order.orderId === orderId);
    if (!entry)
      throw new NotFoundError('logistics.order_not_in_shipment', 'El pedido no va en esta guía.');
    if (entry.deliveredAt) return this.get(id);
    const name = receivedBy.trim();
    if (name.length < 2) {
      throw new ValidationError(
        'logistics.received_by_required',
        'Escribe quién recibió el pedido.',
      );
    }
    await this.shipments.markOrderDelivered(id, orderId, name, at);
    const order = await this.sales.get(orderId);
    const others = await this.shipments.ofOrder(orderId);
    const final =
      order.status === 'DISPATCHED' &&
      others.every((other) => other.shipmentId === id || other.deliveredAt !== null);
    await this.sales.noteDelivery(
      orderId,
      { receivedBy: name, shipmentLabel: shipmentLabel(shipment.number), final },
      at,
    );
    const pending = shipment.orders.filter(
      (item) => item.orderId !== orderId && item.deliveredAt === null,
    );
    if (pending.length === 0) await this.shipments.markDelivered(id, at);
    return this.get(id);
  }

  private async require(id: string): Promise<ShipmentRecord> {
    const shipment = await this.shipments.findById(id);
    if (!shipment) throw new NotFoundError('logistics.shipment_not_found', 'La guía no existe.');
    return shipment;
  }

  private async toView(shipment: ShipmentRecord): Promise<ShipmentView> {
    const orders = await Promise.all(
      shipment.orders.map(async (entry) => {
        const order = await this.sales.get(entry.orderId);
        const carried = new Map(entry.lines.map((line) => [line.productId, line.quantity]));
        return {
          orderId: entry.orderId,
          orderLabel: order.label,
          customer: { id: order.customer.id, name: order.customer.name },
          branch: {
            name: order.branch.name,
            address: order.branch.address,
            city: order.branch.city,
          },
          partial: order.lines.some((line) => (carried.get(line.productId) ?? 0n) < line.quantity),
          deliveredAt: entry.deliveredAt?.toISOString() ?? null,
          receivedBy: entry.receivedBy,
          lines: entry.lines.map((line) => ({
            productId: line.productId,
            productCode: line.productCode,
            productName: line.productName,
            quantity: toQuantityDto(line.quantity, line.unit as UnitCode),
          })),
        };
      }),
    );
    return {
      id: shipment.id,
      label: shipmentLabel(shipment.number),
      carrier: shipment.carrier,
      vehiclePlate: shipment.vehiclePlate,
      driverName: shipment.driverName,
      route: shipment.route,
      scheduledDate: shipment.scheduledDate,
      status: shipment.status,
      statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
      notes: shipment.notes,
      createdBy: shipment.createdByName,
      createdAt: shipment.createdAt.toISOString(),
      dispatchedAt: shipment.dispatchedAt?.toISOString() ?? null,
      dispatchedBy: shipment.dispatchedByName,
      deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
      orders,
    };
  }
}
