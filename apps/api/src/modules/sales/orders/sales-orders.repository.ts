import type { UnitCode } from '../../../shared-kernel/index.js';
import type { OrderStatus } from '../domain/sales-order.js';

export interface OrderLineRecord {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: UnitCode;
  /** Base units of the product. */
  readonly quantity: bigint;
}

export interface OrderRecord {
  readonly id: string;
  readonly number: bigint;
  readonly customer: { id: string; name: string; taxId: string | null };
  readonly seller: { id: string; name: string };
  readonly status: OrderStatus;
  readonly estimatedDeliveryDate: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly dispatchedAt: Date | null;
  readonly dispatchedByName: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
  readonly cancelReason: string | null;
  readonly lines: readonly OrderLineRecord[];
}

export interface OrderFilter {
  readonly statuses?: readonly OrderStatus[];
  readonly sellerId?: string;
  readonly customerId?: string;
  /** Orders with at least one line of this product. */
  readonly productId?: string;
  /** Order number ("PV-00012" or "12") or customer name. */
  readonly search?: string;
  readonly limit: number;
}

export interface OrderContent {
  readonly customerId: string;
  readonly estimatedDeliveryDate: string | null;
  readonly notes: string | null;
  readonly lines: readonly OrderLineRecord[];
}

export abstract class SalesOrdersRepository {
  abstract list(filter: OrderFilter): Promise<OrderRecord[]>;
  abstract findById(id: string): Promise<OrderRecord | undefined>;
  abstract insert(content: OrderContent, seller: { id: string; name: string }): Promise<string>;
  abstract update(id: string, content: OrderContent): Promise<void>;
  abstract markConfirmationStarted(id: string): Promise<void>;
  /** DRAFT → CONFIRMED; false if the order was no longer a draft. */
  abstract markConfirmed(id: string): Promise<boolean>;
  abstract markDispatched(id: string, byName: string): Promise<boolean>;
  abstract markCancelled(id: string, byName: string, reason: string): Promise<boolean>;
  /** Drafts whose confirmation started before `before` and never finished. */
  abstract staleDrafts(before: Date): Promise<{ id: string; number: bigint }[]>;
  abstract clearConfirmationStarted(id: string): Promise<void>;
}
