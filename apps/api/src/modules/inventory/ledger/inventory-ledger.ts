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
  /** Physical stock in base units, summed over warehouses. */
  readonly onHand: bigint;
}

/** What other modules (sales, production, purchasing, planning) do with the stock. */
@Injectable()
export class InventoryLedger {
  constructor(
    private readonly stock: StockService,
    private readonly currentActor: CurrentActor,
  ) {}

  dispatch(command: {
    idempotencyKey: string;
    orderId: string;
    reference: Reference;
    lines: readonly StockLine[];
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('sales-orders:dispatch');
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

  /** The bulk left in the tank after packaging, recorded as waste. */
  recordWaste(command: {
    productId: string;
    quantity: string;
    reference: Reference;
    note?: string;
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('inventory:produce');
    return this.stock.waste({
      line: { productId: command.productId, quantity: command.quantity },
      reference: command.reference,
      ...(command.note ? { note: command.note } : {}),
    });
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

  stockLevels(productIds?: readonly string[]): Promise<StockLevel[]> {
    this.currentActor.requirePermission('inventory:read');
    return this.stock.levels(productIds);
  }
}
