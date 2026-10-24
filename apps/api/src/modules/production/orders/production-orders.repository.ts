import type { UnitCode } from '../../../shared-kernel/index.js';
import type { ProducibleType, ProductionStatus } from '../domain/production-order.js';

export interface ProductionOrderRecord {
  readonly id: string;
  readonly number: bigint;
  readonly product: {
    id: string;
    code: string;
    name: string;
    type: ProducibleType;
    unit: UnitCode;
  };
  readonly batchCapacity: bigint | null;
  readonly plannedQuantity: bigint;
  readonly producedQuantity: bigint | null;
  readonly status: ProductionStatus;
  readonly scheduledDate: string | null;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly completedByName: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByName: string | null;
}

export interface NewProductionOrder {
  readonly product: ProductionOrderRecord['product'];
  readonly batchCapacity: bigint | null;
  readonly plannedQuantity: bigint;
  readonly scheduledDate: string | null;
  readonly notes: string | null;
  readonly createdBy: { id: string; name: string };
}

export abstract class ProductionOrdersRepository {
  abstract list(filter: {
    statuses?: readonly ProductionStatus[];
    limit: number;
  }): Promise<ProductionOrderRecord[]>;
  abstract findById(id: string): Promise<ProductionOrderRecord | undefined>;
  abstract insert(order: NewProductionOrder): Promise<string>;
  abstract markCompleted(id: string, producedQuantity: bigint, byName: string): Promise<boolean>;
  abstract markCancelled(id: string, byName: string): Promise<boolean>;
}
