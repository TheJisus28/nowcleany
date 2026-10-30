import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { AuditTables } from '../audit.tables.js';

export interface TrailEntry {
  readonly id: bigint;
  readonly entityType: string;
  readonly entityId: string;
  readonly label: string;
  readonly action: string;
  readonly summary: string;
  readonly actor: { id: string; name: string; role: string | null };
  readonly occurredAt: Date;
}

export interface NewTrailEntry {
  readonly entityType: string;
  readonly entityId: string;
  readonly label: string;
  readonly action: string;
  readonly summary: string;
  readonly actor: { id: string; name: string; role: string | null };
  readonly occurredAt?: Date | undefined;
}

@Injectable()
export class TrailRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<AuditTables>,
  ) {}

  async insert(entry: NewTrailEntry): Promise<void> {
    await this.host.tx
      .insertInto('activity_log')
      .values({
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        label: entry.label,
        action: entry.action,
        summary: entry.summary,
        actor_id: entry.actor.id,
        actor_name: entry.actor.name,
        actor_role: entry.actor.role,
        ...(entry.occurredAt ? { occurred_at: entry.occurredAt } : {}),
      })
      .execute();
  }

  async list(filter: {
    entityType?: string | undefined;
    entityIds?: readonly string[] | undefined;
    search?: string | undefined;
    from?: Date | undefined;
    limit: number;
  }): Promise<TrailEntry[]> {
    let query = this.host.tx.selectFrom('activity_log').selectAll();
    if (filter.entityType) query = query.where('entity_type', '=', filter.entityType);
    if (filter.entityIds) {
      if (filter.entityIds.length === 0) return [];
      query = query.where('entity_id', 'in', filter.entityIds);
    }
    if (filter.from) query = query.where('occurred_at', '>=', filter.from);
    if (filter.search) {
      const pattern = `%${filter.search.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.where((eb) =>
        eb.or([
          eb('label', 'ilike', pattern),
          eb('summary', 'ilike', pattern),
          eb('actor_name', 'ilike', pattern),
        ]),
      );
    }
    const rows = await query
      .orderBy('occurred_at', 'desc')
      .orderBy('id', 'desc')
      .limit(filter.limit)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: row.label,
      action: row.action,
      summary: row.summary,
      actor: { id: row.actor_id, name: row.actor_name, role: row.actor_role },
      occurredAt: row.occurred_at,
    }));
  }
}
