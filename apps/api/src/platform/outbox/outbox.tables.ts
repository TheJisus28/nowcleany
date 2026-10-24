import type { ColumnType, Generated } from 'kysely';

export interface OutboxTable {
  id: Generated<bigint>;
  event_id: string;
  type: string;
  source: string;
  payload: ColumnType<Record<string, unknown>, string, string>;
  occurred_at: Generated<Date>;
  request_id: string | null;
  actor_id: string | null;
  attempts: Generated<number>;
  available_at: Generated<Date>;
  last_error: string | null;
  published_at: Date | null;
  failed_at: Date | null;
}

/** Each consuming module has its own `inbox` table in its schema (same transaction as its effects). */
export interface InboxTable {
  consumer: string;
  event_id: string;
  processed_at: Generated<Date>;
}

export interface PlatformTables {
  'platform.outbox': OutboxTable;
}

export interface ModuleInboxTables {
  inbox: InboxTable;
}
