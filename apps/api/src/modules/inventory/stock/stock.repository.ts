import type { Balance, MovementType } from '../domain/stock.js';

export interface Warehouse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface BalanceKey {
  readonly warehouseId: string;
  readonly productId: string;
}

export interface NewMovement extends BalanceKey {
  readonly operationId: string;
  readonly type: MovementType;
  readonly quantity: bigint;
  readonly balanceAfter: bigint;
  readonly reference: { type: string; id: string; label: string } | null;
  readonly note: string | null;
  readonly actor: { id: string; name: string };
}

export interface MovementRecord extends NewMovement {
  readonly id: bigint;
  readonly occurredAt: Date;
}

export interface MovementFilter {
  readonly productId?: string;
  readonly warehouseId?: string;
  readonly type?: MovementType;
  readonly from?: Date;
  readonly to?: Date;
  /** Keyset pagination: movements with id lower than this. */
  readonly before?: bigint;
  readonly limit: number;
}

export interface BalanceRecord extends BalanceKey, Balance {}

export interface ReservationRecord {
  readonly orderId: string;
  readonly orderLabel: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly quantity: bigint;
  readonly createdAt: Date;
}

export abstract class StockRepository {
  abstract warehouses(): Promise<Warehouse[]>;
  /** Returns false if the key was already used (the operation must not be applied again). */
  abstract claimOperation(key: string, operationId: string, type: string): Promise<boolean>;
  /** Serialises operations on the same sales order until the transaction ends. */
  abstract lockOrder(orderId: string): Promise<void>;
  /** Creates missing balance rows and locks all of them (SELECT … FOR UPDATE) in a fixed order. */
  abstract lockBalances(keys: readonly BalanceKey[]): Promise<Map<string, Balance>>;
  abstract saveBalance(key: BalanceKey, balance: Balance): Promise<void>;
  abstract insertMovements(movements: readonly NewMovement[]): Promise<void>;
  abstract balances(productIds?: readonly string[]): Promise<BalanceRecord[]>;
  abstract movements(filter: MovementFilter): Promise<MovementRecord[]>;
  abstract reservationsOf(orderId: string): Promise<ReservationRecord[]>;
  abstract reservations(productIds?: readonly string[]): Promise<ReservationRecord[]>;
  abstract insertReservations(rows: readonly Omit<ReservationRecord, 'createdAt'>[]): Promise<void>;
  abstract deleteReservations(orderId: string): Promise<void>;
}

export const balanceKey = (key: BalanceKey): string => `${key.warehouseId}:${key.productId}`;
