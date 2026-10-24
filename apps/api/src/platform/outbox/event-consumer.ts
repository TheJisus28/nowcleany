import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import { MethodDiscovery } from '../discovery.js';
import { systemActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.js';
import type { EventEnvelope } from './event.js';
import { Inbox } from './inbox.js';

export interface EventConsumerOptions {
  /** Event type to consume, e.g. "SalesOrderCancelled". */
  readonly event: string;
  /** Consuming module: its transaction and inbox are used. */
  readonly module: string;
  /** Stable consumer name, part of the inbox key. */
  readonly name: string;
  /** Permissions of the system actor the consumer runs as. */
  readonly permissions?: readonly string[];
}

/**
 * Marks a provider method as an idempotent event consumer. It runs in the consuming module's transaction
 * after claiming the event in that module's inbox; a redelivered event is skipped.
 */
export const EventConsumer = Reflector.createDecorator<EventConsumerOptions>();

interface RegisteredConsumer {
  readonly options: EventConsumerOptions;
  readonly owner: string;
  readonly invoke: (event: EventEnvelope) => Promise<unknown>;
}

@Injectable()
export class EventConsumerRegistry implements OnModuleInit {
  private readonly logger = new Logger('platform');
  private readonly byEvent = new Map<string, RegisteredConsumer[]>();

  constructor(
    private readonly methods: MethodDiscovery,
    private readonly currentActor: CurrentActor,
  ) {}

  onModuleInit(): void {
    for (const method of this.methods.find(EventConsumer)) {
      const list = this.byEvent.get(method.options.event) ?? [];
      list.push(method);
      this.byEvent.set(method.options.event, list);
      this.logger.log(`Consumidor registrado: ${method.options.name} ← ${method.options.event}`);
    }
  }

  /** Delivers to every consumer of the event type; throws if any consumer fails. */
  async deliver(event: EventEnvelope): Promise<void> {
    for (const consumer of this.byEvent.get(event.type) ?? []) {
      const { module, name, permissions = [] } = consumer.options;
      await this.currentActor.runAs(
        systemActor(`consumer:${name}`, permissions),
        () =>
          TransactionHost.getInstance<TransactionalAdapterKysely>(module).withTransaction(
            async () => {
              const inbox = new Inbox(
                TransactionHost.getInstance<TransactionalAdapterKysely>(module),
              );
              if (await inbox.claim(name, event.id)) await consumer.invoke(event);
            },
          ),
        event.requestId ?? undefined,
      );
    }
  }
}
