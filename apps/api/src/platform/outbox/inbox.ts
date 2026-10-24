import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import type { Kysely } from 'kysely';
import type { ModuleInboxTables } from './outbox.tables.js';

/** Idempotent consumption: records (consumer, event) in the module's own inbox, in its transaction. */
export class Inbox {
  constructor(private readonly transactionHost: TransactionHost<TransactionalAdapterKysely>) {}

  /** Returns false when this consumer already processed the event (the caller must skip it). */
  async claim(consumer: string, eventId: string): Promise<boolean> {
    const tx = this.transactionHost.tx as unknown as Kysely<ModuleInboxTables>;
    const inserted = await tx
      .insertInto('inbox')
      .values({ consumer, event_id: eventId })
      .onConflict((conflict) => conflict.columns(['consumer', 'event_id']).doNothing())
      .returning('event_id')
      .executeTakeFirst();
    return inserted !== undefined;
  }
}
