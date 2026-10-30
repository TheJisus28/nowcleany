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
    unit_cost: Generated<bigint>;
  };
  supplier_invoices: {
    id: Generated<string>;
    purchase_order_id: string;
    supplier_id: string;
    supplier_name: string;
    document_number: string;
    invoice_date: string;
    due_date: string;
    subtotal: bigint;
    tax: bigint;
    total: bigint;
    paid: Generated<bigint>;
    received_by_name: string;
    created_at: Generated<Date>;
  };
  supplier_invoice_lines: {
    supplier_invoice_id: string;
    line_no: number;
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: bigint;
    unit_cost: bigint;
    amount: bigint;
  };
  supplier_payments: {
    id: Generated<string>;
    supplier_invoice_id: string;
    amount: bigint;
    paid_on: string;
    method: string;
    reference: string | null;
    recorded_by_name: string;
    created_at: Generated<Date>;
  };
  purchase_plans: {
    month: string;
    product_id: string;
    quantity: bigint;
    set_by_name: string;
    updated_at: Generated<Date>;
  };
}
