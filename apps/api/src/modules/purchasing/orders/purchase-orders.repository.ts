import type { UnitCode } from '../../../shared-kernel/index.js';
import type { PurchaseStatus } from '../domain/purchase-order.js';

export interface PurchaseLineRecord {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly unit: UnitCode;
  /** Base units. */
  readonly quantity: bigint;
  readonly receivedQuantity: bigint | null;
}

export interface PurchaseOrderRecord {
  readonly id: string;
  readonly number: bigint;
  readonly supplier: string;
  readonly expectedDate: string | null;
  readonly status: PurchaseStatus;
  readonly notes: string | null;
  readonly receiptDocument: string | null;
  readonly createdBy: { id: string; name: string };
  readonly createdAt: Date;
  readonly receivedAt: Date | null;
  readonly receivedByName: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
  readonly lines: readonly PurchaseLineRecord[];
}

export interface NewPurchaseOrder {
  readonly supplier: string;
  readonly expectedDate: string | null;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
  readonly lines: readonly Omit<PurchaseLineRecord, 'receivedQuantity'>[];
}

export abstract class PurchaseOrdersRepository {
  abstract list(filter: {
    statuses?: readonly PurchaseStatus[];
    limit: number;
  }): Promise<PurchaseOrderRecord[]>;
  abstract findById(id: string): Promise<PurchaseOrderRecord | undefined>;
  abstract insert(order: NewPurchaseOrder): Promise<string>;
  abstract markReceived(
    id: string,
    received: ReadonlyMap<string, bigint>,
    byName: string,
    document: string | null,
  ): Promise<boolean>;
  abstract markCancelled(id: string, byName: string): Promise<boolean>;
}
