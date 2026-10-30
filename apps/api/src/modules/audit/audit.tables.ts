import type { Generated } from 'kysely';

export interface AuditTables {
  activity_log: {
    id: Generated<bigint>;
    entity_type: string;
    entity_id: string;
    label: string;
    action: string;
    summary: string;
    actor_id: string;
    actor_name: string;
    actor_role: string | null;
    occurred_at: Generated<Date>;
  };
}
