import type { Generated } from 'kysely';
import type { PurchaseStatus } from './domain/purchase-order.js';

export interface PurchasingTables {
  suppliers: {
    id: Generated<string>;
    document_number: string | null;
    name: string;
    contact: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  purchase_orders: {
    id: Generated<string>;
    number: Generated<bigint>;
    supplier_id: string;
    supplier: string;
    expected_date: string | null;
    status: PurchaseStatus;
    notes: string | null;
    receipt_document: string | null;
    created_by: string;
    created_by_name: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    received_at: Date | null;
    received_by_name: string | null;
    cancelled_at: Date | null;
    cancelled_by_name: string | null;
  };
  purchase_order_lines: {
    order_id: string;
    line_no: number;
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: bigint;
    received_quantity: bigint | null;
  };
}
