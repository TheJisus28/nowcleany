import type { Generated } from 'kysely';
import type { OrderStatus } from './domain/sales-order.js';

export interface SalesTables {
  customers: {
    id: Generated<string>;
    name: string;
    tax_id: string | null;
    phone: string | null;
    city: string | null;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  sales_orders: {
    id: Generated<string>;
    number: Generated<bigint>;
    customer_id: string;
    seller_id: string;
    seller_name: string;
    status: OrderStatus;
    estimated_delivery_date: string | null;
    notes: string | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    confirmed_at: Date | null;
    dispatched_at: Date | null;
    dispatched_by_name: string | null;
    cancelled_at: Date | null;
    cancelled_by_name: string | null;
    cancel_reason: string | null;
  };
  sales_order_lines: {
    order_id: string;
    line_no: number;
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: bigint;
  };
}
