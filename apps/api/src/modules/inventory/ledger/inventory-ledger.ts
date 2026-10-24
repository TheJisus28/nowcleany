import { Injectable } from '@nestjs/common';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  type OperationResult,
  type QuantityInput,
  type Reference,
  type StockLine,
  StockService,
} from '../stock/stock.service.js';

export interface StockLevel {
  readonly productId: string;
  /** Base units, summed over warehouses. */
  readonly onHand: bigint;
  readonly reserved: bigint;
}

export interface OpenReservation {
  readonly orderId: string;
  readonly orderLabel: string;
  readonly productId: string;
  readonly quantity: bigint;
  readonly reservedAt: Date;
}

/**
 * Public API of the inventory module. Every call re-checks the caller's permission: here no route
 * guard ran for the inventory side of the operation.
 */
@Injectable()
export class InventoryLedger {
  constructor(
    private readonly stock: StockService,
    private readonly currentActor: CurrentActor,
  ) {}

  reserve(
    orderId: string,
    orderLabel: string,
    lines: readonly StockLine[],
  ): Promise<{ alreadyReserved: boolean }> {
    this.currentActor.requirePermission('inventory:reserve');
    return this.stock.reserve({ orderId, orderLabel, lines });
  }

  release(orderId: string): Promise<{ released: boolean }> {
    this.currentActor.requirePermission('inventory:reserve');
    return this.stock.release(orderId);
  }

  dispatch(command: {
    idempotencyKey: string;
    orderId: string;
    reference: Reference;
    lines: readonly StockLine[];
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('inventory:dispatch');
    return this.stock.dispatch(command);
  }

  recordProduction(command: {
    idempotencyKey: string;
    output: StockLine;
    consumptions: readonly StockLine[];
    reference: Reference;
    note?: string;
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('inventory:produce');
    return this.stock.recordProduction(command);
  }

  receive(command: {
    idempotencyKey: string;
    lines: readonly QuantityInput[];
    reference: Reference;
    note?: string;
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('inventory:receive');
    return this.stock.receive(command);
  }

  async stockLevels(productIds?: readonly string[]): Promise<StockLevel[]> {
    this.currentActor.requirePermission('inventory:read');
    return this.stock.levels(productIds);
  }

  async openReservations(productIds?: readonly string[]): Promise<OpenReservation[]> {
    this.currentActor.requirePermission('inventory:read');
    return (await this.stock.reservations(productIds)).map((reservation) => ({
      orderId: reservation.orderId,
      orderLabel: reservation.orderLabel,
      productId: reservation.productId,
      quantity: reservation.quantity,
      reservedAt: reservation.createdAt,
    }));
  }
}
