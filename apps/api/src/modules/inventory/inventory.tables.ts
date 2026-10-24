import type { Generated } from 'kysely';
import type { MovementType } from './domain/stock.js';

export interface InventoryTables {
  warehouses: { id: Generated<string>; code: string; name: string; active: Generated<boolean> };
  stock_balances: {
    warehouse_id: string;
    product_id: string;
    on_hand: Generated<bigint>;
    reserved: Generated<bigint>;
    updated_at: Generated<Date>;
  };
  stock_movements: {
    id: Generated<bigint>;
    operation_id: string;
    warehouse_id: string;
    product_id: string;
    type: MovementType;
    quantity: bigint;
    balance_after: bigint;
    reference_type: string | null;
    reference_id: string | null;
    reference_label: string | null;
    note: string | null;
    actor_id: string;
    actor_name: string;
    occurred_at: Generated<Date>;
  };
  reservations: {
    order_id: string;
    order_label: string;
    product_id: string;
    warehouse_id: string;
    quantity: bigint;
    created_at: Generated<Date>;
  };
  operations: {
    idempotency_key: string;
    operation_id: string;
    type: string;
    created_at: Generated<Date>;
  };
}
