import type { Generated } from 'kysely';
import type { ProducibleType, ProductionStatus } from './domain/production-order.js';

export interface ProductionTables {
  production_orders: {
    id: Generated<string>;
    number: Generated<bigint>;
    product_id: string;
    product_code: string;
    product_name: string;
    product_type: ProducibleType;
    unit: string;
    batch_capacity: bigint | null;
    planned_quantity: bigint;
    produced_quantity: bigint | null;
    status: ProductionStatus;
    scheduled_date: string | null;
    notes: string | null;
    created_by: string;
    created_by_name: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    completed_at: Date | null;
    completed_by_name: string | null;
    cancelled_at: Date | null;
    cancelled_by_name: string | null;
  };
}
