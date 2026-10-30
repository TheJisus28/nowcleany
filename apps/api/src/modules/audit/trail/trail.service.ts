import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { type TrailEntry, TrailRepository } from './trail.repository.js';

/** Documents that leave a trail. */
export type TrailEntity =
  'sales_order' | 'invoice' | 'shipment' | 'purchase_order' | 'production_order';

export const TRAIL_ENTITY_LABELS: Partial<Record<string, string>> = {
  sales_order: 'Preventa',
  invoice: 'Factura',
  shipment: 'Guía',
  purchase_order: 'Orden de compra',
  production_order: 'Orden de producción',
};

export interface TrailView {
  readonly id: string;
  readonly entityType: string;
  readonly entityTypeLabel: string;
  readonly entityId: string;
  readonly label: string;
  readonly action: string;
  readonly summary: string;
  readonly actor: { id: string; name: string; role: string | null };
  readonly occurredAt: string;
}

/**
 * The trail: every step of every document, who did and authorized it and when. Modules write to it
 * in the same transaction as the step itself, so a step without its trail entry cannot exist.
 */
@Injectable()
export class Trail {
  constructor(
    private readonly entries: TrailRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  async record(step: {
    entity: TrailEntity;
    id: string;
    label: string;
    action: string;
    summary: string;
    /** Seeds backdate history; real steps happen now. */
    at?: Date | undefined;
  }): Promise<void> {
    const actor = this.currentActor.require();
    await this.entries.insert({
      entityType: step.entity,
      entityId: step.id,
      label: step.label,
      action: step.action,
      summary: step.summary,
      actor: { id: actor.id, name: actor.displayName, role: actor.roleName ?? null },
      occurredAt: step.at,
    });
  }

  /** Steps of some documents, oldest first (a document's timeline). Callers check access. */
  @Transactional()
  async of(entity: TrailEntity, ids: readonly string[]): Promise<TrailView[]> {
    const rows = await this.entries.list({ entityType: entity, entityIds: ids, limit: 500 });
    return rows.reverse().map(toView);
  }

  @Transactional()
  async list(filter: {
    entityType?: string | undefined;
    search?: string | undefined;
    from?: string | undefined;
    limit?: number | undefined;
  }): Promise<TrailView[]> {
    this.currentActor.requirePermission('trail:read');
    const rows = await this.entries.list({
      entityType: filter.entityType,
      search: filter.search,
      from: filter.from ? new Date(`${filter.from}T00:00:00-05:00`) : undefined,
      limit: Math.min(filter.limit ?? 300, 1000),
    });
    return rows.map(toView);
  }
}

function toView(entry: TrailEntry): TrailView {
  return {
    id: entry.id.toString(),
    entityType: entry.entityType,
    entityTypeLabel: TRAIL_ENTITY_LABELS[entry.entityType] ?? entry.entityType,
    entityId: entry.entityId,
    label: entry.label,
    action: entry.action,
    summary: entry.summary,
    actor: entry.actor,
    occurredAt: entry.occurredAt.toISOString(),
  };
}
