import { randomUUID } from 'node:crypto';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import type { Kysely } from 'kysely';
import type { CurrentActor } from '../security/current-actor.js';
import type { PlatformTables } from './outbox.tables.js';

/**
 * Writes integration events to platform.outbox inside the calling module's transaction, so the event
 * exists if and only if the state change committed. Module roles may only INSERT into the outbox.
 */
export class EventPublisher {
  constructor(
    private readonly source: string,
    private readonly transactionHost: TransactionHost<TransactionalAdapterKysely>,
    private readonly actor: CurrentActor,
    private readonly requestId: () => string | undefined,
  ) {}

  async publish(type: string, payload: Record<string, unknown>): Promise<string> {
    if (!this.transactionHost.isTransactionActive()) {
      throw new Error(
        `EventPublisher.publish("${type}") requiere una transacción activa del módulo ${this.source}.`,
      );
    }
    const eventId = randomUUID();
    const tx = this.transactionHost.tx as unknown as Kysely<PlatformTables>;
    await tx
      .insertInto('platform.outbox')
      .values({
        event_id: eventId,
        type,
        source: this.source,
        payload: JSON.stringify(payload),
        request_id: this.requestId() ?? null,
        actor_id: this.actor.get()?.id ?? null,
        last_error: null,
        published_at: null,
        failed_at: null,
      })
      .execute();
    return eventId;
  }
}
