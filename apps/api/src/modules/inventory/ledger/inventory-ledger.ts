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
    /** Where the order was prepared. */
    warehouseCode?: string;
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
    fromWarehouseCode?: string;
    toWarehouseCode?: string;
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
    warehouseCode?: string;
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('inventory:produce');
    return this.stock.waste({
      line: { productId: command.productId, quantity: command.quantity },
      reference: command.reference,
      ...(command.warehouseCode ? { warehouseCode: command.warehouseCode } : {}),
      ...(command.note ? { note: command.note } : {}),
    });
  }

  /** Physical stock of some products in a warehouse (the first one when none is named). */
  stockIn(
    warehouseCode: string | undefined,
    productIds: readonly string[],
  ): Promise<{ warehouse: { code: string; name: string }; levels: Map<string, bigint> }> {
    this.currentActor.requirePermission('sales-orders:prepare');
    return this.stock.stockIn(warehouseCode, productIds);
  }

  receive(command: {
    idempotencyKey: string;
    lines: readonly QuantityInput[];
    reference: Reference;
    note?: string;
    warehouseCode?: string;
  }): Promise<OperationResult> {
    this.currentActor.requirePermission('inventory:receive');
    return this.stock.receive(command);
  }

  stockLevels(productIds?: readonly string[]): Promise<StockLevel[]> {
    this.currentActor.requirePermission('inventory:read');
    return this.stock.levels(productIds);
  }
}
