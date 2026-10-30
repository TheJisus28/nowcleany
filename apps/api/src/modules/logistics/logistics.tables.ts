import type { Generated } from 'kysely';
import type { ShipmentStatus } from './domain/shipment.js';

export interface LogisticsTables {
  shipments: {
    id: Generated<string>;
    number: Generated<bigint>;
    carrier: string;
    vehicle_plate: string;
    driver_name: string;
    route: string | null;
    scheduled_date: string;
    status: ShipmentStatus;
    notes: string | null;
    created_by_name: string;
    created_at: Generated<Date>;
    dispatched_at: Date | null;
    dispatched_by_name: string | null;
    delivered_at: Date | null;
  };
  shipment_orders: {
    shipment_id: string;
    order_id: string;
    position: number;
    delivered_at: Date | null;
    received_by: string | null;
  };
  shipment_lines: {
    shipment_id: string;
    order_id: string;
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: bigint;
  };
}
