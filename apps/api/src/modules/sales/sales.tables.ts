import type { Generated } from 'kysely';
import type { DocumentType } from './domain/customer.js';
import type { OrderStatus } from './domain/sales-order.js';

export interface SalesTables {
  customers: {
    id: Generated<string>;
    document_type: DocumentType;
    document_number: string;
    name: string;
    address: string | null;
    phone: string | null;
    city: string | null;
    seller_id: string | null;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  customer_branches: {
    id: Generated<string>;
    customer_id: string;
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    is_main: Generated<boolean>;
    active: Generated<boolean>;
    created_at: Generated<Date>;
  };
  sales_orders: {
    id: Generated<string>;
    number: Generated<bigint>;
    customer_id: string;
    branch_id: string;
    seller_id: string;
    seller_name: string;
    status: OrderStatus;
    estimated_delivery_date: string | null;
    notes: string | null;
    priority: number | null;
    allow_partial: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    confirmed_at: Date | null;
    invoiced_at: Date | null;
    invoiced_by_name: string | null;
    ready_at: Date | null;
    ready_by_name: string | null;
    ready_warehouse: string | null;
    dispatched_at: Date | null;
    dispatched_by_name: string | null;
    delivered_at: Date | null;
    received_by: string | null;
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
    ready_quantity: Generated<bigint>;
    dispatched_quantity: Generated<bigint>;
  };
  visits: {
    id: Generated<string>;
    seller_id: string;
    customer_id: string;
    branch_id: string;
    visited_at: Generated<Date>;
    latitude: number;
    longitude: number;
    accuracy_m: number | null;
    distance_m: number | null;
    notes: string | null;
    order_id: string | null;
  };
  /** Read only, for seller names. */
  users: { id: string; full_name: string };
}
