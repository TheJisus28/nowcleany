import { setTimeout as sleep } from 'node:timers/promises';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabasePools } from '../db/database-pools.js';
import type { EventEnvelope } from './event.js';
import { EventConsumerRegistry } from './event-consumer.js';
import type { PlatformTables } from './outbox.tables.js';

const BATCH_SIZE = 20;
const IDLE_POLL_MS = 1_000;
export const MAX_ATTEMPTS = 10;

/**
 * Runs only in the worker. A single active dispatcher (advisory transaction lock) delivers pending events
 * in strict id order; a failing event stops the batch and is retried with exponential backoff, and after
 * MAX_ATTEMPTS it is marked failed_at and an alert is logged.
 */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('platform');
  private running = false;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly pools: DatabasePools,
    private readonly consumers: EventConsumerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      let delivered = 0;
      try {
        delivered = await this.dispatchBatch();
      } catch (error) {
        this.logger.error({ err: error }, 'Error del despachador del outbox');
      }
      if (delivered < BATCH_SIZE) await sleep(IDLE_POLL_MS);
    }
  }

  /** Delivers up to BATCH_SIZE events; returns how many were published. */
  async dispatchBatch(): Promise<number> {
    const db = this.pools.kysely<PlatformTables>('platform');
    return db.transaction().execute(async (trx) => {
      const lock = await sql<{ locked: boolean }>`
        SELECT pg_try_advisory_xact_lock(hashtext('nowcleanny.outbox')) AS locked`.execute(trx);
      if (!lock.rows[0]?.locked) return 0;

      const pending = await trx
        .selectFrom('platform.outbox')
        .selectAll()
        .where('published_at', 'is', null)
        .where('failed_at', 'is', null)
        .orderBy('id')
        .limit(BATCH_SIZE)
        .forUpdate()
        .skipLocked()
        .execute();

      let delivered = 0;
      for (const row of pending) {
        if (row.available_at > new Date()) break; // backing off; later events wait to keep order
        const event: EventEnvelope = {
          id: row.event_id,
          type: row.type,
          source: row.source,
          payload: row.payload,
          occurredAt: row.occurred_at,
          requestId: row.request_id,
          actorId: row.actor_id,
        };
        try {
          await this.consumers.deliver(event);
          await trx
            .updateTable('platform.outbox')
            .set({ published_at: new Date(), attempts: row.attempts + 1, last_error: null })
            .where('id', '=', row.id)
            .execute();
          delivered++;
        } catch (error) {
          await this.recordFailure(trx, row.id, row.attempts + 1, event, error);
          break;
        }
      }
      return delivered;
    });
  }

  private async recordFailure(
    trx: Transaction<PlatformTables>,
    id: bigint,
    attempts: number,
    event: EventEnvelope,
    error: unknown,
  ): Promise<void> {
    const failed = attempts >= MAX_ATTEMPTS;
    const backoffSeconds = Math.min(2 ** attempts, 300);
    const message = error instanceof Error ? error.message : String(error);
    await trx
      .updateTable('platform.outbox')
      .set({
        attempts,
        last_error: message.slice(0, 2000),
        available_at: sql<Date>`now() + make_interval(secs => ${backoffSeconds})`,
        failed_at: failed ? new Date() : null,
      })
      .where('id', '=', id)
      .execute();
    const context = { eventId: event.id, eventType: event.type, attempts, err: error };
    if (failed) {
      this.logger.error(
        { ...context, alert: true },
        `ALERTA: el evento ${event.type} (${event.id}) falló ${String(attempts)} veces y quedó marcado como fallido`,
      );
    } else {
      this.logger.warn(
        context,
        `Falló la entrega del evento ${event.type} (${event.id}); se reintentará en ${String(backoffSeconds)} s`,
      );
    }
  }
}
