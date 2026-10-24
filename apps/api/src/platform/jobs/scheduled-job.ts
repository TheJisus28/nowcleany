import { setTimeout as sleep } from 'node:timers/promises';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'kysely';
import { DatabasePools } from '../db/database-pools.js';
import { type DiscoveredMethod, MethodDiscovery } from '../discovery.js';
import { systemActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.js';

export interface ScheduledJobOptions {
  /** Unique name, also the advisory-lock key: only one worker runs a given job at a time. */
  readonly name: string;
  readonly intervalMs: number;
  /** Permissions of the system actor the job runs as. */
  readonly permissions?: readonly string[];
}

/** Marks a provider method as a periodic job. Jobs run only in the worker. */
export const ScheduledJob = Reflector.createDecorator<ScheduledJobOptions>();

@Injectable()
export class JobRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('platform');
  private running = false;
  private loops: Promise<void>[] = [];

  constructor(
    private readonly methods: MethodDiscovery,
    private readonly pools: DatabasePools,
    private readonly currentActor: CurrentActor,
  ) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.loops = this.methods.find(ScheduledJob).map((job) => this.loop(job));
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    await Promise.all(this.loops);
  }

  private async loop(job: DiscoveredMethod<ScheduledJobOptions>): Promise<void> {
    this.logger.log(
      `Tarea programada: ${job.options.name} cada ${String(job.options.intervalMs)} ms`,
    );
    for (;;) {
      await sleep(job.options.intervalMs);
      if (!this.running) return;
      try {
        await this.runOnce(job);
      } catch (error) {
        this.logger.error(
          { err: error, job: job.options.name },
          `Falló la tarea ${job.options.name}`,
        );
      }
    }
  }

  private async runOnce(job: DiscoveredMethod<ScheduledJobOptions>): Promise<void> {
    const { name, permissions = [] } = job.options;
    await this.pools
      .kysely('platform')
      .transaction()
      .execute(async (trx) => {
        const lock = await sql<{ locked: boolean }>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`nowcleanny.job.${name}`})) AS locked`.execute(
          trx,
        );
        if (!lock.rows[0]?.locked) return;
        await this.currentActor.runAs(systemActor(`job:${name}`, permissions), () => job.invoke());
      });
  }
}
