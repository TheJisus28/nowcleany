import type { Generated } from 'kysely';

export interface BillingTables {
  invoices: {
    id: Generated<string>;
    number: Generated<bigint>;
    order_id: string;
    order_label: string;
    customer_id: string;
    customer_name: string;
    customer_document: string;
    branch_name: string;
    seller_id: string;
    seller_name: string;
    issued_at: Generated<Date>;
    due_date: string;
    subtotal: bigint;
    tax: bigint;
    total: bigint;
    paid: Generated<bigint>;
    issued_by_name: string;
  };
  invoice_lines: {
    invoice_id: string;
    line_no: number;
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: bigint;
    unit_price: bigint;
    amount: bigint;
    from_stock: bigint;
    pending: bigint;
  };
  payments: {
    id: Generated<string>;
    invoice_id: string;
    amount: bigint;
    paid_on: string;
    method: string;
    reference: string | null;
    recorded_by_name: string;
    created_at: Generated<Date>;
  };
}
