import type { QuantityDto } from '../../../shared-kernel/index.js';
import type { CoverageStatus } from '../domain/planning.js';

export interface ProductRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface MaterialLine extends ProductRef {
  readonly typeLabel: string;
  readonly quantity: QuantityDto;
}

export interface OversellRow {
  readonly product: ProductRef;
  /** Confirmed, not yet dispatched. */
  readonly sold: QuantityDto;
  /** Drafts: potential demand, not counted. */
  readonly potential: QuantityDto;
  readonly bySeller: readonly {
    sellerId: string;
    sellerName: string;
    orders: number;
    quantity: QuantityDto;
  }[];
  readonly onHand: QuantityDto;
  /** What can still be made with the materials available now (product computed on its own). */
  readonly producible: QuantityDto;
  readonly capacity: QuantityDto;
  readonly uncovered: QuantityDto;
  readonly limitingMaterial: ProductRef | null;
  /** Materials (down to raw materials) needed to make the uncovered quantity. */
  readonly materialsToCover: readonly MaterialLine[];
}

export interface OversellReport {
  readonly generatedAt: string;
  readonly rows: readonly OversellRow[];
}

export interface CoverageLineView {
  readonly product: ProductRef;
  readonly quantity: QuantityDto;
  readonly fromStock: QuantityDto;
  readonly fromProduction: QuantityDto;
  readonly uncovered: QuantityDto;
  readonly status: CoverageStatus;
  readonly statusLabel: string;
}

export interface OrderCoverageView {
  readonly orderId: string;
  readonly label: string;
  readonly customerName: string;
  readonly seller: { id: string; name: string };
  readonly estimatedDeliveryDate: string | null;
  readonly confirmedAt: string | null;
  /** 1 = served first. */
  readonly priority: number;
  readonly status: CoverageStatus;
  readonly statusLabel: string;
  readonly lines: readonly CoverageLineView[];
}

export interface DrivingOrder {
  readonly orderId: string;
  readonly label: string;
  readonly customerName: string;
  readonly sellerName: string;
  readonly estimatedDeliveryDate: string | null;
  readonly quantity: QuantityDto;
  readonly toProduce: QuantityDto;
}

export interface PackagingNeed {
  readonly product: ProductRef;
  readonly demand: QuantityDto;
  readonly onHand: QuantityDto;
  readonly toPack: QuantityDto;
  readonly planned: QuantityDto;
  readonly pendingToSchedule: QuantityDto;
  readonly canMakeNow: QuantityDto;
  readonly limitingMaterial: ProductRef | null;
  readonly orders: readonly DrivingOrder[];
}

export interface BulkNeed {
  readonly product: ProductRef;
  readonly required: QuantityDto;
  readonly onHand: QuantityDto;
  readonly toProduce: QuantityDto;
  readonly planned: QuantityDto;
  readonly pendingToSchedule: QuantityDto;
  readonly batchCapacity: QuantityDto | null;
  readonly batchesPending: number | null;
  readonly canMakeNow: QuantityDto;
  readonly limitingMaterial: ProductRef | null;
  readonly usedBy: readonly ProductRef[];
}

export interface ProductionNeeds {
  readonly generatedAt: string;
  readonly packaging: readonly PackagingNeed[];
  readonly bulk: readonly BulkNeed[];
}

export interface PurchaseNeed {
  readonly product: ProductRef;
  readonly required: QuantityDto;
  readonly onHand: QuantityDto;
  readonly onOrder: QuantityDto;
  /** Exactly the net shortage: no safety stock. */
  readonly toBuy: QuantityDto;
  readonly usedBy: readonly ProductRef[];
  readonly inTransit: readonly {
    orderId: string;
    label: string;
    supplier: string;
    expectedDate: string | null;
    quantity: QuantityDto;
  }[];
}

export interface PurchaseNeeds {
  readonly generatedAt: string;
  readonly rows: readonly PurchaseNeed[];
}

export interface PlanningSummary {
  readonly generatedAt: string;
  readonly confirmedOrders: number;
  readonly draftOrders: number;
  readonly ordersByCoverage: Record<CoverageStatus, number>;
  readonly oversoldProducts: number;
  readonly productsToPack: number;
  readonly bulksToProduce: number;
  readonly materialsToBuy: number;
  readonly plannedProductionOrders: number;
  readonly purchaseOrdersInTransit: number;
  /** Products with demand but no active formula: their needs cannot be computed. */
  readonly missingFormulas: readonly ProductRef[];
}
